'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Eye, Edit3 } from 'lucide-react';
import { Button } from '@/components/ui';
import { Agent } from '../page';
import styles from './tabs.module.css';

interface Props {
  agent: Agent;
  onSave: (updates: Partial<Agent>) => Promise<boolean>;
  saving: boolean;
}

const defaultReadme = `# {agent.name}

## What it does
Describe what your agent does in plain language.

## When to use it
- Use case 1
- Use case 2
- Use case 3

## Example

**Input:**
\`\`\`json
{
  "query": "example input"
}
\`\`\`

**Output:**
\`\`\`json
{
  "result": "example output"
}
\`\`\`

## Limitations
- Any limitations developers should know about
`;

export default function ReadmeTab({ agent, onSave, saving }: Props) {
  const [readme, setReadme] = useState(agent.readme || defaultReadme.replace('{agent.name}', agent.name));
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit');

  const insertMarkdown = (before: string, after: string) => {
    const textarea = document.querySelector(`.${styles.docsEditor}`) as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selected = text.substring(start, end);

    const newText = text.substring(0, start) + before + selected + after + text.substring(end);
    setReadme(newText);

    // Set cursor position
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, end + before.length);
    }, 0);
  };

  const handleSave = () => {
    onSave({ readme });
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h2 className={styles.title}>Tell Your Story</h2>
        <p className={styles.desc}>
          Great agents have great documentation. Show developers why your agent is worth paying for.
        </p>
      </div>

      <div className={styles.formGroup}>
        <div className={styles.readmeToolbar}>
          <div className={styles.readmeToolbarLeft}>
            {viewMode === 'edit' && (
              <>
                <button onClick={() => insertMarkdown('**', '**')} title="Bold">
                  <strong>B</strong>
                </button>
                <button onClick={() => insertMarkdown('*', '*')} title="Italic">
                  <em>I</em>
                </button>
                <button onClick={() => insertMarkdown('`', '`')} title="Code">
                  &lt;/&gt;
                </button>
                <button onClick={() => insertMarkdown('[', '](url)')} title="Link">
                  Link
                </button>
                <button onClick={() => insertMarkdown('# ', '')} title="Heading">
                  H1
                </button>
                <button onClick={() => insertMarkdown('- ', '')} title="List">
                  List
                </button>
              </>
            )}
          </div>
          <div className={styles.readmeViewTabs}>
            <button
              className={`${styles.readmeViewTab} ${viewMode === 'edit' ? styles.readmeViewTabActive : ''}`}
              onClick={() => setViewMode('edit')}
            >
              <Edit3 size={14} />
              Edit
            </button>
            <button
              className={`${styles.readmeViewTab} ${viewMode === 'preview' ? styles.readmeViewTabActive : ''}`}
              onClick={() => setViewMode('preview')}
            >
              <Eye size={14} />
              Preview
            </button>
          </div>
        </div>
        {viewMode === 'edit' ? (
          <textarea
            className={styles.docsEditor}
            value={readme}
            onChange={(e) => setReadme(e.target.value)}
            rows={15}
            placeholder="Write your documentation in Markdown..."
          />
        ) : (
          <div className={styles.docsPreview}>
            <ReactMarkdown>{readme}</ReactMarkdown>
          </div>
        )}
      </div>

      <div className={styles.actionBar}>
        <Button onClick={handleSave} loading={saving}>
          {saving ? 'Saving...' : 'Save Documentation'}
        </Button>
      </div>
    </div>
  );
}
