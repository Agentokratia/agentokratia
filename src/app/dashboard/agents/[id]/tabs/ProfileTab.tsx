'use client';

import { useState, KeyboardEvent } from 'react';
import { Button, Input, Textarea, Select } from '@/components/ui';
import { Agent } from '../page';
import styles from './tabs.module.css';

const categories = [
  { value: 'ai', label: 'Research & Analysis' },
  { value: 'data', label: 'Data Processing' },
  { value: 'content', label: 'Content Generation' },
  { value: 'tools', label: 'Code & Development' },
  { value: 'other', label: 'Other' },
];

interface Props {
  agent: Agent;
  onSave: (updates: Partial<Agent>) => Promise<boolean>;
  saving: boolean;
}

export default function ProfileTab({ agent, onSave, saving }: Props) {
  const [name, setName] = useState(agent.name);
  const [description, setDescription] = useState(agent.description || '');
  const [category, setCategory] = useState(agent.category);
  const [tags, setTags] = useState<string[]>(agent.tags || []);
  const [tagInput, setTagInput] = useState('');

  const handleAddTag = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      if (!tags.includes(tagInput.trim())) {
        setTags([...tags, tagInput.trim()]);
      }
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const handleSave = () => {
    onSave({
      name,
      description: description || null,
      category,
    });
  };

  return (
    <div className={styles.panel}>
      <div className={styles.twoColumn}>
        {/* Left column - Main fields */}
        <div className={styles.mainColumn}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Web Scraper, Code Reviewer"
            />
            <p className={styles.formHint}>Short and descriptive name for your agent.</p>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>One-liner</label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Finds and summarizes research papers on any topic"
              maxLength={80}
            />
            <p className={styles.formHint}>What does your agent do? One sentence.</p>
          </div>

          <div className={styles.threeColumn}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Category</label>
              <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                {categories.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Version</label>
              <Input value="1.0.0" disabled />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Tags</label>
              <div className={styles.tagsContainer}>
                {tags.map((tag) => (
                  <span key={tag} className={styles.tag}>
                    {tag}
                    <button onClick={() => handleRemoveTag(tag)}>&times;</button>
                  </span>
                ))}
                <input
                  type="text"
                  className={styles.tagsInput}
                  placeholder="Add a tag..."
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleAddTag}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right column - Icon */}
        <div className={styles.sideColumn}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Icon</label>
            <div className={styles.uploadZone}>
              <p>Drop image or click</p>
              <span>256x256px min</span>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.actionBar}>
        <Button onClick={handleSave} loading={saving}>
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
