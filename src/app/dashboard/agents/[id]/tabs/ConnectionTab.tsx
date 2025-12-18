'use client';

import { useState } from 'react';
import {
  Plus,
  Trash2,
  GripVertical,
  AlertCircle,
  CheckCircle,
  Download,
  Upload,
} from 'lucide-react';
import { Button, Input, Select } from '@/components/ui';
import { PLACEHOLDER_ENDPOINT } from '@/lib/utils/constants';
import { TestPlayground } from '@/components/dashboard/TestPlayground';
import { Agent } from '../page';
import styles from './tabs.module.css';

interface Props {
  agent: Agent;
  onSave: (updates: Partial<Agent>) => Promise<boolean>;
  saving: boolean;
  secretKey: string | null;
}

interface SchemaField {
  id: string;
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'integer';
  description: string;
  required: boolean;
  enumValues?: string[];
}

const fieldTypes = [
  { value: 'string', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'integer', label: 'Integer' },
  { value: 'boolean', label: 'Yes/No' },
  { value: 'array', label: 'List' },
  { value: 'object', label: 'Object' },
];

// Validate JSON Schema structure
const validateJsonSchema = (json: string): { valid: boolean; error?: string; schema?: object } => {
  if (!json.trim()) return { valid: true, schema: undefined };

  try {
    const parsed = JSON.parse(json);

    // Basic JSON Schema validation
    if (typeof parsed !== 'object' || parsed === null) {
      return { valid: false, error: 'Schema must be an object' };
    }

    // Check for valid type
    if (
      parsed.type &&
      !['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'].includes(parsed.type)
    ) {
      return { valid: false, error: `Invalid type: ${parsed.type}` };
    }

    // If type is object, validate properties
    if (parsed.type === 'object' && parsed.properties) {
      if (typeof parsed.properties !== 'object') {
        return { valid: false, error: 'Properties must be an object' };
      }

      // Validate each property
      for (const [key, value] of Object.entries(parsed.properties)) {
        if (typeof value !== 'object' || value === null) {
          return { valid: false, error: `Property "${key}" must be an object` };
        }
      }

      // Validate required array
      if (parsed.required && !Array.isArray(parsed.required)) {
        return { valid: false, error: 'Required must be an array' };
      }
    }

    return { valid: true, schema: parsed };
  } catch (e) {
    return { valid: false, error: e instanceof SyntaxError ? e.message : 'Invalid JSON' };
  }
};

// Validate and parse OpenAPI spec
const validateOpenApiSpec = (
  json: string
): { valid: boolean; error?: string; inputSchema?: object; outputSchema?: object } => {
  if (!json.trim()) return { valid: true };

  try {
    const parsed = JSON.parse(json);

    // Check for OpenAPI version
    if (!parsed.openapi && !parsed.swagger) {
      return { valid: false, error: 'Missing openapi or swagger version field' };
    }

    // Extract schemas from paths or components
    let inputSchema: object | undefined;
    let outputSchema: object | undefined;

    // Try to find schemas in paths
    if (parsed.paths) {
      const firstPath = Object.values(parsed.paths)[0] as Record<string, unknown> | undefined;
      if (firstPath) {
        const postOp = firstPath.post as Record<string, unknown> | undefined;
        if (postOp) {
          // Input from requestBody
          const requestBody = postOp.requestBody as Record<string, unknown> | undefined;
          if (requestBody?.content) {
            const content = requestBody.content as Record<string, { schema?: object }>;
            const jsonContent = content['application/json'];
            if (jsonContent?.schema) {
              inputSchema = resolveRef(jsonContent.schema, parsed);
            }
          }

          // Output from responses
          const responses = postOp.responses as Record<string, unknown> | undefined;
          if (responses) {
            const successResponse = (responses['200'] || responses['201']) as
              | Record<string, unknown>
              | undefined;
            if (successResponse?.content) {
              const content = successResponse.content as Record<string, { schema?: object }>;
              const jsonContent = content['application/json'];
              if (jsonContent?.schema) {
                outputSchema = resolveRef(jsonContent.schema, parsed);
              }
            }
          }
        }
      }
    }

    // Also check components/schemas directly
    if (parsed.components?.schemas) {
      const schemas = parsed.components.schemas as Record<string, object>;
      if (!inputSchema && (schemas.Input || schemas.Request || schemas.RequestBody)) {
        inputSchema = schemas.Input || schemas.Request || schemas.RequestBody;
      }
      if (!outputSchema && (schemas.Output || schemas.Response || schemas.ResponseBody)) {
        outputSchema = schemas.Output || schemas.Response || schemas.ResponseBody;
      }
    }

    return { valid: true, inputSchema, outputSchema };
  } catch (e) {
    return { valid: false, error: e instanceof SyntaxError ? e.message : 'Invalid JSON' };
  }
};

// Resolve $ref in OpenAPI schema with depth limit to prevent infinite loops
const MAX_REF_DEPTH = 10;
const resolveRef = (schema: object, root: object, depth = 0): object => {
  // Prevent infinite loops from circular references
  if (depth > MAX_REF_DEPTH) {
    console.warn('Max $ref resolution depth exceeded, possible circular reference');
    return schema;
  }

  const s = schema as { $ref?: string };
  if (s.$ref) {
    const refPath = s.$ref.replace('#/', '').split('/');
    let resolved: unknown = root;
    for (const part of refPath) {
      resolved = (resolved as Record<string, unknown>)?.[part];
      if (!resolved) break;
    }

    if (resolved && typeof resolved === 'object') {
      // Check for direct circular reference
      if (resolved === schema) return schema;
      // Recursively resolve nested refs
      return resolveRef(resolved as object, root, depth + 1);
    }
    return schema;
  }
  return schema;
};

// Generate OpenAPI spec from JSON schemas
const generateOpenApiSpec = (
  inputSchema: object | null,
  outputSchema: object | null,
  agentName: string,
  endpointUrl: string
): string => {
  const spec = {
    openapi: '3.0.3',
    info: {
      title: `${agentName} API`,
      version: '1.0.0',
      description: `API specification for ${agentName}`,
    },
    servers: [{ url: endpointUrl || 'https://api.example.com' }],
    paths: {
      '/': {
        post: {
          summary: `Call ${agentName}`,
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: inputSchema || { type: 'object', properties: {} },
              },
            },
          },
          responses: {
            '200': {
              description: 'Successful response',
              content: {
                'application/json': {
                  schema: outputSchema || { type: 'object', properties: {} },
                },
              },
            },
          },
        },
      },
    },
  };
  return JSON.stringify(spec, null, 2);
};

// Helper to normalize JSON Schema type (can be string or array like ["string", "null"])
const normalizeSchemaType = (type: unknown): SchemaField['type'] => {
  if (Array.isArray(type)) {
    // Find first non-null type
    const nonNullType = type.find((t) => t !== 'null');
    return (nonNullType as SchemaField['type']) || 'string';
  }
  if (typeof type === 'string') {
    return type as SchemaField['type'];
  }
  return 'string';
};

const jsonSchemaToFields = (schema: object | null): SchemaField[] => {
  if (!schema || typeof schema !== 'object') {
    return [{ id: '1', name: '', type: 'string', description: '', required: false }];
  }
  const s = schema as {
    properties?: Record<string, { type?: unknown; description?: string; enum?: string[] }>;
    required?: string[];
  };
  if (!s.properties || Object.keys(s.properties).length === 0) {
    return [{ id: '1', name: '', type: 'string', description: '', required: false }];
  }
  return Object.entries(s.properties).map(([name, prop], i) => ({
    id: String(Date.now() + i),
    name,
    type: normalizeSchemaType(prop.type),
    description: prop.description || '',
    required: s.required?.includes(name) || false,
    enumValues: prop.enum,
  }));
};

export default function ConnectionTab({ agent, onSave, saving, secretKey }: Props) {
  const [endpointUrl, setEndpointUrl] = useState(
    agent.endpointUrl === PLACEHOLDER_ENDPOINT ? '' : agent.endpointUrl
  );
  // Convert ms to seconds for UI display
  const [timeoutVal, setTimeoutVal] = useState(
    String(Math.floor((agent.timeoutMs || 30000) / 1000))
  );
  const [schemaMode, setSchemaMode] = useState<'visual' | 'json' | 'openapi'>('visual');

  // Visual schema builder state - initialize from agent's saved schemas
  const [inputFields, setInputFields] = useState<SchemaField[]>(() =>
    jsonSchemaToFields(agent.inputSchema)
  );
  const [outputFields, setOutputFields] = useState<SchemaField[]>(() =>
    jsonSchemaToFields(agent.outputSchema)
  );

  // Saved fields for TestPlayground - only updates on save (not on every keystroke)
  const [playgroundFields, setPlaygroundFields] = useState<SchemaField[]>(() =>
    jsonSchemaToFields(agent.inputSchema)
  );

  // JSON schema state
  const [inputSchemaJson, setInputSchemaJson] = useState(() =>
    agent.inputSchema ? JSON.stringify(agent.inputSchema, null, 2) : ''
  );
  const [outputSchemaJson, setOutputSchemaJson] = useState(() =>
    agent.outputSchema ? JSON.stringify(agent.outputSchema, null, 2) : ''
  );

  // OpenAPI spec state
  const [openApiSpec, setOpenApiSpec] = useState(() =>
    generateOpenApiSpec(agent.inputSchema, agent.outputSchema, agent.name, agent.endpointUrl)
  );
  const [openApiError, setOpenApiError] = useState<string | null>(null);

  // Validation state
  const [inputSchemaError, setInputSchemaError] = useState<string | null>(null);
  const [outputSchemaError, setOutputSchemaError] = useState<string | null>(null);

  // Validate on JSON change
  const handleInputJsonChange = (value: string) => {
    setInputSchemaJson(value);
    const result = validateJsonSchema(value);
    setInputSchemaError(result.valid ? null : result.error || 'Invalid schema');
  };

  const handleOutputJsonChange = (value: string) => {
    setOutputSchemaJson(value);
    const result = validateJsonSchema(value);
    setOutputSchemaError(result.valid ? null : result.error || 'Invalid schema');
  };

  // Handle OpenAPI spec change
  const handleOpenApiChange = (value: string) => {
    setOpenApiSpec(value);
    const result = validateOpenApiSpec(value);
    setOpenApiError(result.valid ? null : result.error || 'Invalid OpenAPI spec');
  };

  // Switch to visual mode - parse JSON and update fields
  const switchToVisual = () => {
    // If coming from OpenAPI, extract schemas first
    if (schemaMode === 'openapi') {
      const result = validateOpenApiSpec(openApiSpec);
      if (result.valid) {
        if (result.inputSchema) {
          setInputFields(jsonSchemaToFields(result.inputSchema));
        }
        if (result.outputSchema) {
          setOutputFields(jsonSchemaToFields(result.outputSchema));
        }
      }
    } else {
      // Coming from JSON mode
      const inputResult = validateJsonSchema(inputSchemaJson);
      const outputResult = validateJsonSchema(outputSchemaJson);

      if (inputResult.valid && inputResult.schema) {
        setInputFields(jsonSchemaToFields(inputResult.schema));
      }
      if (outputResult.valid && outputResult.schema) {
        setOutputFields(jsonSchemaToFields(outputResult.schema));
      }
    }

    setSchemaMode('visual');
  };

  // Switch to JSON mode - generate JSON from fields
  const switchToJson = () => {
    if (schemaMode === 'openapi') {
      // Extract from OpenAPI
      const result = validateOpenApiSpec(openApiSpec);
      if (result.valid) {
        setInputSchemaJson(result.inputSchema ? JSON.stringify(result.inputSchema, null, 2) : '');
        setOutputSchemaJson(
          result.outputSchema ? JSON.stringify(result.outputSchema, null, 2) : ''
        );
      }
    } else {
      // From visual mode
      setInputSchemaJson(JSON.stringify(fieldsToJsonSchema(inputFields), null, 2));
      setOutputSchemaJson(JSON.stringify(fieldsToJsonSchema(outputFields), null, 2));
    }
    setInputSchemaError(null);
    setOutputSchemaError(null);
    setSchemaMode('json');
  };

  // Switch to OpenAPI mode - generate spec from current schemas
  const switchToOpenApi = () => {
    let inputSchema: object | null = null;
    let outputSchema: object | null = null;

    if (schemaMode === 'visual') {
      inputSchema = fieldsToJsonSchema(inputFields);
      outputSchema = fieldsToJsonSchema(outputFields);
    } else if (schemaMode === 'json') {
      try {
        inputSchema = inputSchemaJson ? JSON.parse(inputSchemaJson) : null;
      } catch {}
      try {
        outputSchema = outputSchemaJson ? JSON.parse(outputSchemaJson) : null;
      } catch {}
    }

    setOpenApiSpec(generateOpenApiSpec(inputSchema, outputSchema, agent.name, endpointUrl));
    setOpenApiError(null);
    setSchemaMode('openapi');
  };

  const addField = (isInput: boolean) => {
    const newField: SchemaField = {
      id: Date.now().toString(),
      name: '',
      type: 'string',
      description: '',
      required: false,
    };
    if (isInput) {
      setInputFields([...inputFields, newField]);
    } else {
      setOutputFields([...outputFields, newField]);
    }
  };

  const updateField = (isInput: boolean, id: string, updates: Partial<SchemaField>) => {
    const setter = isInput ? setInputFields : setOutputFields;
    const fields = isInput ? inputFields : outputFields;
    setter(fields.map((f) => (f.id === id ? { ...f, ...updates } : f)));
  };

  const removeField = (isInput: boolean, id: string) => {
    const setter = isInput ? setInputFields : setOutputFields;
    const fields = isInput ? inputFields : outputFields;
    setter(fields.filter((f) => f.id !== id));
  };

  const fieldsToJsonSchema = (fields: SchemaField[]) => {
    const properties: Record<string, object> = {};
    const required: string[] = [];

    fields.forEach((field) => {
      if (!field.name) return;
      properties[field.name] = {
        type: field.type,
        ...(field.description && { description: field.description }),
        ...(field.enumValues?.length && { enum: field.enumValues }),
      };
      if (field.required) required.push(field.name);
    });

    return {
      type: 'object',
      properties,
      ...(required.length && { required }),
    };
  };

  const handleSave = () => {
    if (!endpointUrl) return;
    // Convert seconds back to ms for storage
    const timeoutMs = parseInt(timeoutVal, 10) * 1000;

    // Get schemas based on current mode
    let inputSchema: object | null = null;
    let outputSchema: object | null = null;

    if (schemaMode === 'visual') {
      inputSchema = fieldsToJsonSchema(inputFields);
      outputSchema = fieldsToJsonSchema(outputFields);
    } else if (schemaMode === 'json') {
      // Parse JSON mode schemas
      try {
        inputSchema = inputSchemaJson ? JSON.parse(inputSchemaJson) : null;
      } catch {
        /* invalid JSON, skip */
      }
      try {
        outputSchema = outputSchemaJson ? JSON.parse(outputSchemaJson) : null;
      } catch {
        /* invalid JSON, skip */
      }
    } else if (schemaMode === 'openapi') {
      // Extract from OpenAPI spec
      const result = validateOpenApiSpec(openApiSpec);
      if (result.valid) {
        inputSchema = result.inputSchema || null;
        outputSchema = result.outputSchema || null;
      }
    }

    // Update playground fields on successful save
    onSave({ endpointUrl, timeoutMs, inputSchema, outputSchema }).then((success) => {
      if (success && inputSchema) {
        setPlaygroundFields(jsonSchemaToFields(inputSchema));
      }
    });
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h2 className={styles.title}>Connect Your Agent</h2>
        <p className={styles.desc}>
          Define your endpoint, describe what your agent accepts and returns.
        </p>
      </div>

      {/* Endpoint Section - Two column layout */}
      <div className={styles.formSection}>
        <div className={styles.formSectionTitle}>Endpoint</div>
        <div className={styles.twoColumn}>
          <div className={styles.mainColumn}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Backend URL</label>
              <Input
                type="url"
                value={endpointUrl}
                onChange={(e) => setEndpointUrl(e.target.value)}
                placeholder="https://your-server.com/api/agent"
              />
              <p className={styles.formHint}>
                Where should we forward requests? Must accept POST and return JSON.
              </p>
            </div>
          </div>
          <div className={styles.sideColumn}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Timeout</label>
              <Select value={timeoutVal} onChange={(e) => setTimeoutVal(e.target.value)}>
                <option value="30">30 seconds</option>
                <option value="60">60 seconds</option>
                <option value="120">2 minutes</option>
                <option value="300">5 minutes</option>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {/* Schema Section */}
      <div className={styles.formSection}>
        <div className={styles.formSectionTitle}>
          API Schema
          <div className={styles.schemaTabs}>
            <button
              className={`${styles.schemaTab} ${schemaMode === 'visual' ? styles.active : ''}`}
              onClick={switchToVisual}
            >
              Visual Builder
            </button>
            <button
              className={`${styles.schemaTab} ${schemaMode === 'json' ? styles.active : ''}`}
              onClick={switchToJson}
            >
              JSON Schema
            </button>
            <button
              className={`${styles.schemaTab} ${schemaMode === 'openapi' ? styles.active : ''}`}
              onClick={switchToOpenApi}
            >
              OpenAPI Spec
            </button>
          </div>
        </div>

        {schemaMode === 'visual' ? (
          <div className={styles.schemaVisual}>
            {/* Input Fields */}
            <div className={styles.schemaSection}>
              <div className={styles.schemaSectionHeader}>
                <h4>Input Parameters</h4>
                <p>What does your agent accept?</p>
              </div>
              <div className={styles.fieldsList}>
                {inputFields.map((field, i) => (
                  <div key={field.id} className={styles.fieldRow}>
                    <div className={styles.fieldDrag}>
                      <GripVertical size={14} />
                    </div>
                    <div className={styles.fieldInputs}>
                      <input
                        type="text"
                        placeholder="field_name"
                        value={field.name}
                        onChange={(e) =>
                          updateField(true, field.id, {
                            name: e.target.value.replace(/\s/g, '_').toLowerCase(),
                          })
                        }
                        className={styles.fieldName}
                      />
                      <select
                        value={field.type || 'string'}
                        onChange={(e) =>
                          updateField(true, field.id, {
                            type: e.target.value as SchemaField['type'],
                          })
                        }
                        className={styles.fieldType}
                      >
                        {fieldTypes.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        placeholder="Description (optional)"
                        value={field.description}
                        onChange={(e) =>
                          updateField(true, field.id, { description: e.target.value })
                        }
                        className={styles.fieldDesc}
                      />
                      <label className={styles.fieldRequired}>
                        <input
                          type="checkbox"
                          checked={field.required}
                          onChange={(e) =>
                            updateField(true, field.id, { required: e.target.checked })
                          }
                        />
                        <span>Required</span>
                      </label>
                    </div>
                    <button
                      className={styles.fieldRemove}
                      onClick={() => removeField(true, field.id)}
                      disabled={i === 0 && inputFields.length === 1}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
              <button className={styles.addFieldBtn} onClick={() => addField(true)}>
                <Plus size={14} />
                Add Parameter
              </button>
            </div>

            {/* Output Fields */}
            <div className={styles.schemaSection}>
              <div className={styles.schemaSectionHeader}>
                <h4>Output Fields</h4>
                <p>What does your agent return?</p>
              </div>
              <div className={styles.fieldsList}>
                {outputFields.map((field, i) => (
                  <div key={field.id} className={styles.fieldRow}>
                    <div className={styles.fieldDrag}>
                      <GripVertical size={14} />
                    </div>
                    <div className={styles.fieldInputs}>
                      <input
                        type="text"
                        placeholder="field_name"
                        value={field.name}
                        onChange={(e) =>
                          updateField(false, field.id, {
                            name: e.target.value.replace(/\s/g, '_').toLowerCase(),
                          })
                        }
                        className={styles.fieldName}
                      />
                      <select
                        value={field.type || 'string'}
                        onChange={(e) =>
                          updateField(false, field.id, {
                            type: e.target.value as SchemaField['type'],
                          })
                        }
                        className={styles.fieldType}
                      >
                        {fieldTypes.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        placeholder="Description (optional)"
                        value={field.description}
                        onChange={(e) =>
                          updateField(false, field.id, { description: e.target.value })
                        }
                        className={styles.fieldDesc}
                      />
                      <label className={styles.fieldRequired}>
                        <input
                          type="checkbox"
                          checked={field.required}
                          onChange={(e) =>
                            updateField(false, field.id, { required: e.target.checked })
                          }
                        />
                        <span>Required</span>
                      </label>
                    </div>
                    <button
                      className={styles.fieldRemove}
                      onClick={() => removeField(false, field.id)}
                      disabled={i === 0 && outputFields.length === 1}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
              <button className={styles.addFieldBtn} onClick={() => addField(false)}>
                <Plus size={14} />
                Add Field
              </button>
            </div>
          </div>
        ) : schemaMode === 'json' ? (
          <div className={styles.schemaJson}>
            <div className={styles.schemaJsonPanel}>
              <div className={styles.schemaJsonHeader}>
                <span>Input Schema</span>
                {inputSchemaJson &&
                  (inputSchemaError ? (
                    <span
                      style={{
                        color: 'var(--error)',
                        fontSize: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <AlertCircle size={12} /> {inputSchemaError}
                    </span>
                  ) : (
                    <span
                      style={{
                        color: 'var(--success)',
                        fontSize: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <CheckCircle size={12} /> Valid
                    </span>
                  ))}
              </div>
              <textarea
                value={inputSchemaJson}
                onChange={(e) => handleInputJsonChange(e.target.value)}
                placeholder='{"type": "object", "properties": {...}}'
                spellCheck={false}
                style={{ borderColor: inputSchemaError ? 'var(--error)' : undefined }}
              />
            </div>
            <div className={styles.schemaJsonPanel}>
              <div className={styles.schemaJsonHeader}>
                <span>Output Schema</span>
                {outputSchemaJson &&
                  (outputSchemaError ? (
                    <span
                      style={{
                        color: 'var(--error)',
                        fontSize: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <AlertCircle size={12} /> {outputSchemaError}
                    </span>
                  ) : (
                    <span
                      style={{
                        color: 'var(--success)',
                        fontSize: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <CheckCircle size={12} /> Valid
                    </span>
                  ))}
              </div>
              <textarea
                value={outputSchemaJson}
                onChange={(e) => handleOutputJsonChange(e.target.value)}
                placeholder='{"type": "object", "properties": {...}}'
                spellCheck={false}
                style={{ borderColor: outputSchemaError ? 'var(--error)' : undefined }}
              />
            </div>
          </div>
        ) : schemaMode === 'openapi' ? (
          <div className={styles.schemaOpenApi}>
            <div className={styles.openApiHeader}>
              <div className={styles.openApiInfo}>
                <p>Paste an OpenAPI 3.0 specification or edit the generated one below.</p>
                <p className={styles.openApiHint}>
                  The input schema is extracted from <code>requestBody</code> and output from{' '}
                  <code>responses.200</code>.
                </p>
              </div>
              <div className={styles.openApiActions}>
                <button
                  className={styles.openApiBtn}
                  onClick={() => {
                    const blob = new Blob([openApiSpec], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${agent.slug || 'agent'}-openapi.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  <Download size={14} />
                  Export
                </button>
                <label className={styles.openApiBtn}>
                  <Upload size={14} />
                  Import
                  <input
                    type="file"
                    accept=".json,.yaml,.yml"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;

                      // Validate file size (max 1MB)
                      const MAX_FILE_SIZE = 1024 * 1024;
                      if (file.size > MAX_FILE_SIZE) {
                        setOpenApiError('File too large (max 1MB)');
                        return;
                      }

                      // Validate file type
                      const ext = file.name.split('.').pop()?.toLowerCase();
                      if (!ext || !['json', 'yaml', 'yml'].includes(ext)) {
                        setOpenApiError('Invalid file type. Use .json, .yaml, or .yml');
                        return;
                      }

                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        const content = ev.target?.result as string;
                        handleOpenApiChange(content);
                      };
                      reader.onerror = () => {
                        setOpenApiError('Failed to read file');
                      };
                      reader.readAsText(file);
                    }}
                  />
                </label>
              </div>
            </div>
            <div className={styles.openApiEditor}>
              <div className={styles.schemaJsonHeader}>
                <span>OpenAPI 3.0 Specification</span>
                {openApiSpec &&
                  (openApiError ? (
                    <span
                      style={{
                        color: 'var(--error)',
                        fontSize: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <AlertCircle size={12} /> {openApiError}
                    </span>
                  ) : (
                    <span
                      style={{
                        color: 'var(--success)',
                        fontSize: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <CheckCircle size={12} /> Valid
                    </span>
                  ))}
              </div>
              <textarea
                value={openApiSpec}
                onChange={(e) => handleOpenApiChange(e.target.value)}
                placeholder='{"openapi": "3.0.3", "info": {...}, "paths": {...}}'
                spellCheck={false}
                style={{
                  borderColor: openApiError ? 'var(--error)' : undefined,
                  minHeight: '400px',
                }}
              />
            </div>
          </div>
        ) : null}
      </div>

      {/* Test Playground */}
      <div className={styles.formSection}>
        <div className={styles.formSectionTitle}>Test Playground</div>
        <p className={styles.formHint} style={{ marginBottom: '16px' }}>
          Test your agent before publishing. We recommend at least one successful test.
        </p>

        <TestPlayground
          endpointUrl={endpointUrl}
          inputFields={playgroundFields}
          secretKey={secretKey}
        />
      </div>

      <div className={styles.actionBar}>
        <Button onClick={handleSave} loading={saving}>
          {saving ? 'Saving...' : 'Save Connection'}
        </Button>
      </div>
    </div>
  );
}
