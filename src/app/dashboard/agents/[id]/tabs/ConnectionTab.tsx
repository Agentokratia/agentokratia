'use client';

import { useState } from 'react';
import { Play, Plus, Trash2, GripVertical, AlertCircle, CheckCircle } from 'lucide-react';
import { Button, Input, Select } from '@/components/ui';
import { useAuthStore } from '@/lib/store/authStore';
import { PLACEHOLDER_ENDPOINT } from '@/lib/utils/constants';
import { Agent } from '../page';
import styles from './tabs.module.css';

interface Props {
  agent: Agent;
  onSave: (updates: Partial<Agent>) => Promise<boolean>;
  saving: boolean;
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
    if (parsed.type && !['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'].includes(parsed.type)) {
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

// Helper to convert JSON Schema to visual fields
const jsonSchemaToFields = (schema: object | null): SchemaField[] => {
  if (!schema || typeof schema !== 'object') {
    return [{ id: '1', name: '', type: 'string', description: '', required: false }];
  }
  const s = schema as { properties?: Record<string, { type?: string; description?: string; enum?: string[] }>; required?: string[] };
  if (!s.properties || Object.keys(s.properties).length === 0) {
    return [{ id: '1', name: '', type: 'string', description: '', required: false }];
  }
  return Object.entries(s.properties).map(([name, prop], i) => ({
    id: String(Date.now() + i),
    name,
    type: (prop.type as SchemaField['type']) || 'string',
    description: prop.description || '',
    required: s.required?.includes(name) || false,
    enumValues: prop.enum,
  }));
};

export default function ConnectionTab({ agent, onSave, saving }: Props) {
  const { token } = useAuthStore();
  const [endpointUrl, setEndpointUrl] = useState(
    agent.endpointUrl === PLACEHOLDER_ENDPOINT ? '' : agent.endpointUrl
  );
  // Convert ms to seconds for UI display
  const [timeoutVal, setTimeoutVal] = useState(String(Math.floor((agent.timeoutMs || 30000) / 1000)));
  const [schemaMode, setSchemaMode] = useState<'visual' | 'json'>('visual');

  // Visual schema builder state - initialize from agent's saved schemas
  const [inputFields, setInputFields] = useState<SchemaField[]>(() =>
    jsonSchemaToFields(agent.inputSchema)
  );
  const [outputFields, setOutputFields] = useState<SchemaField[]>(() =>
    jsonSchemaToFields(agent.outputSchema)
  );

  // JSON schema state
  const [inputSchemaJson, setInputSchemaJson] = useState(() =>
    agent.inputSchema ? JSON.stringify(agent.inputSchema, null, 2) : ''
  );
  const [outputSchemaJson, setOutputSchemaJson] = useState(() =>
    agent.outputSchema ? JSON.stringify(agent.outputSchema, null, 2) : ''
  );

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

  // Switch to visual mode - parse JSON and update fields
  const switchToVisual = () => {
    // Try to parse JSON schemas into visual fields
    const inputResult = validateJsonSchema(inputSchemaJson);
    const outputResult = validateJsonSchema(outputSchemaJson);

    if (inputResult.valid && inputResult.schema) {
      setInputFields(jsonSchemaToFields(inputResult.schema));
    }
    if (outputResult.valid && outputResult.schema) {
      setOutputFields(jsonSchemaToFields(outputResult.schema));
    }

    setSchemaMode('visual');
  };

  // Switch to JSON mode - generate JSON from fields
  const switchToJson = () => {
    setInputSchemaJson(JSON.stringify(fieldsToJsonSchema(inputFields), null, 2));
    setOutputSchemaJson(JSON.stringify(fieldsToJsonSchema(outputFields), null, 2));
    setInputSchemaError(null);
    setOutputSchemaError(null);
    setSchemaMode('json');
  };

  // Test playground state
  const [testInputs, setTestInputs] = useState<Record<string, string>>({});
  const [testResponse, setTestResponse] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<{ code: number; text: string; success: boolean } | null>(null);
  const [testing, setTesting] = useState(false);

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
    setter(fields.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  const removeField = (isInput: boolean, id: string) => {
    const setter = isInput ? setInputFields : setOutputFields;
    const fields = isInput ? inputFields : outputFields;
    setter(fields.filter(f => f.id !== id));
  };

  const fieldsToJsonSchema = (fields: SchemaField[]) => {
    const properties: Record<string, object> = {};
    const required: string[] = [];

    fields.forEach(field => {
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
    } else {
      // Parse JSON mode schemas
      try {
        inputSchema = inputSchemaJson ? JSON.parse(inputSchemaJson) : null;
      } catch { /* invalid JSON, skip */ }
      try {
        outputSchema = outputSchemaJson ? JSON.parse(outputSchemaJson) : null;
      } catch { /* invalid JSON, skip */ }
    }

    onSave({ endpointUrl, timeoutMs, inputSchema, outputSchema });
  };

  const runTest = async () => {
    if (!endpointUrl || !token) return;

    setTesting(true);
    setTestResponse(null);
    setTestStatus(null);

    // Build payload from input fields
    const payload: Record<string, unknown> = {};
    inputFields.forEach(field => {
      if (!field.name) return;
      const value = testInputs[field.name];
      if (value === undefined || value === '') return;

      // Convert to proper type
      if (field.type === 'number' || field.type === 'integer') {
        payload[field.name] = Number(value);
      } else if (field.type === 'boolean') {
        payload[field.name] = value === 'true';
      } else if (field.type === 'array') {
        try {
          payload[field.name] = JSON.parse(value);
        } catch {
          payload[field.name] = value.split(',').map(s => s.trim());
        }
      } else {
        payload[field.name] = value;
      }
    });

    try {
      const res = await fetch('/api/agents/test-endpoint', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ url: endpointUrl, payload }),
      });

      const data = await res.json();

      if (data.reachable) {
        setTestStatus({ code: data.status, text: data.statusText, success: data.success });
        // Show the actual response from the target API
        if (data.response !== null && data.response !== undefined) {
          setTestResponse(typeof data.response === 'string'
            ? data.response
            : JSON.stringify(data.response, null, 2));
        } else {
          setTestResponse(JSON.stringify({ message: 'Empty response from endpoint' }, null, 2));
        }
      } else {
        setTestStatus({ code: 0, text: 'Unreachable', success: false });
        setTestResponse(JSON.stringify({ error: data.error || 'Could not reach endpoint' }, null, 2));
      }
    } catch (err) {
      setTestStatus({ code: 0, text: 'Error', success: false });
      setTestResponse(JSON.stringify({
        error: err instanceof Error ? err.message : 'Test failed'
      }, null, 2));
    } finally {
      setTesting(false);
    }
  };

  const FieldRow = ({ field, isInput, index }: { field: SchemaField; isInput: boolean; index: number }) => (
    <div className={styles.fieldRow}>
      <div className={styles.fieldDrag}>
        <GripVertical size={14} />
      </div>
      <div className={styles.fieldInputs}>
        <input
          type="text"
          placeholder="field_name"
          value={field.name}
          onChange={(e) => updateField(isInput, field.id, { name: e.target.value.replace(/\s/g, '_').toLowerCase() })}
          className={styles.fieldName}
        />
        <select
          value={field.type}
          onChange={(e) => updateField(isInput, field.id, { type: e.target.value as SchemaField['type'] })}
          className={styles.fieldType}
        >
          {fieldTypes.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Description (optional)"
          value={field.description}
          onChange={(e) => updateField(isInput, field.id, { description: e.target.value })}
          className={styles.fieldDesc}
        />
        <label className={styles.fieldRequired}>
          <input
            type="checkbox"
            checked={field.required}
            onChange={(e) => updateField(isInput, field.id, { required: e.target.checked })}
          />
          <span>Required</span>
        </label>
      </div>
      <button
        className={styles.fieldRemove}
        onClick={() => removeField(isInput, field.id)}
        disabled={index === 0 && (isInput ? inputFields : outputFields).length === 1}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h2 className={styles.title}>Connect Your Agent</h2>
        <p className={styles.desc}>Define your endpoint, describe what your agent accepts and returns.</p>
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
              <p className={styles.formHint}>Where should we forward requests? Must accept POST and return JSON.</p>
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
                  <FieldRow key={field.id} field={field} isInput={true} index={i} />
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
                  <FieldRow key={field.id} field={field} isInput={false} index={i} />
                ))}
              </div>
              <button className={styles.addFieldBtn} onClick={() => addField(false)}>
                <Plus size={14} />
                Add Field
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.schemaJson}>
            <div className={styles.schemaJsonPanel}>
              <div className={styles.schemaJsonHeader}>
                <span>Input Schema</span>
                {inputSchemaJson && (
                  inputSchemaError ? (
                    <span style={{ color: 'var(--error)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <AlertCircle size={12} /> {inputSchemaError}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--success)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <CheckCircle size={12} /> Valid
                    </span>
                  )
                )}
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
                {outputSchemaJson && (
                  outputSchemaError ? (
                    <span style={{ color: 'var(--error)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <AlertCircle size={12} /> {outputSchemaError}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--success)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <CheckCircle size={12} /> Valid
                    </span>
                  )
                )}
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
        )}
      </div>

      {/* Test Playground */}
      <div className={styles.formSection}>
        <div className={styles.formSectionTitle}>Test Playground</div>
        <p className={styles.formHint} style={{ marginBottom: '16px' }}>
          Test your agent before publishing. We recommend at least one successful test.
        </p>

        <div className={styles.playground}>
          <div className={styles.playgroundRequest}>
            <div className={styles.playgroundHeader}>
              <span>Request</span>
              <span className={styles.playgroundMethod}>POST</span>
            </div>
            <div className={styles.playgroundForm}>
              {inputFields.filter(f => f.name).map(field => (
                <div key={field.id} className={styles.playgroundField}>
                  <label>
                    {field.name}
                    {field.required && <span className={styles.required}>*</span>}
                  </label>
                  {field.type === 'boolean' ? (
                    <select
                      value={testInputs[field.name] || 'false'}
                      onChange={(e) => setTestInputs({ ...testInputs, [field.name]: e.target.value })}
                    >
                      <option value="true">Yes</option>
                      <option value="false">No</option>
                    </select>
                  ) : (
                    <input
                      type={field.type === 'number' ? 'number' : 'text'}
                      placeholder={field.description || `Enter ${field.name}...`}
                      value={testInputs[field.name] || ''}
                      onChange={(e) => setTestInputs({ ...testInputs, [field.name]: e.target.value })}
                    />
                  )}
                </div>
              ))}
            </div>
            <div className={styles.playgroundActions}>
              <Button onClick={runTest} loading={testing} disabled={!endpointUrl}>
                <Play size={16} />
                Run Test
              </Button>
              {!endpointUrl && (
                <span className={styles.playgroundHint}>Enter a backend URL first</span>
              )}
            </div>
          </div>

          <div className={styles.playgroundResponse}>
            <div className={styles.playgroundHeader}>
              <span>Response</span>
              {testStatus && (
                <span
                  className={styles.playgroundStatus}
                  style={{
                    background: testStatus.success ? 'var(--success)' : 'var(--error)',
                    color: 'white'
                  }}
                >
                  {testStatus.code} {testStatus.text}
                </span>
              )}
            </div>
            <div className={styles.playgroundOutput}>
              {testResponse || (
                <span className={styles.playgroundEmpty}>Run a test to see the response</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className={styles.actionBar}>
        <Button onClick={handleSave} loading={saving}>
          {saving ? 'Saving...' : 'Save Connection'}
        </Button>
      </div>
    </div>
  );
}
