// src/components/CommandInput.tsx
import { type RefObject } from "react";
import { Icon } from "./Icon";

interface CommandInputProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  inputRef: RefObject<HTMLInputElement>;
}

export function CommandInput({ value, onChange, onSubmit, disabled, inputRef }: CommandInputProps) {
  return (
    <div className="cmd-input-wrap">
      <div className="cmd-input-inner">
        <Icon name="sparkle" size={16} />
        <input
          ref={inputRef}
          className="cmd-input"
          placeholder="Describe what you'd like to do — e.g. Email Priya about the Q4 review"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && value.trim() && !disabled) onSubmit();
          }}
          disabled={disabled}
          aria-label="Natural language command"
          autoComplete="off"
          spellCheck="false"
        />
        <button
          className="cmd-submit"
          onClick={onSubmit}
          disabled={disabled || !value.trim()}
          type="button"
        >
          <span>Translate</span>
          <Icon name="arrow" size={14} />
        </button>
      </div>
      <div className="cmd-meta">
        <span className="kbd">⌘K</span>
        <span>to focus</span>
        <span className="sep">·</span>
        <span className="kbd">↵</span>
        <span>to translate</span>
        <span className="sep">·</span>
        <span>10 intents supported</span>
      </div>
    </div>
  );
}
