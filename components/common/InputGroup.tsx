import React from "react";
import * as Icons from "./Icons";

interface InputGroupProps {
  label: string;
  children: React.ReactNode;
  htmlFor?: string;
  className?: string;
  error?: string;
  labelClassName?: string;
  description?: string;
}

const InputGroup: React.FC<InputGroupProps> = ({
  label,
  children,
  htmlFor,
  className = "",
  error,
  labelClassName = "",
  description,
}) => (
  <div className={`flex flex-col ${className}`}>
    <label
      htmlFor={htmlFor}
      className={`
        mb-2 text-sm font-semibold
        text-[var(--color-text)]
        ${labelClassName}
      `}
    >
      {label}
    </label>
    {children}
    {description && <p className="mt-1.5 text-xs text-[var(--color-text-muted)]">{description}</p>}
    {error && (
      <p className="mt-1.5 text-xs font-medium text-[var(--color-danger)] flex items-center gap-1">
        <Icons.ExclamationCircleIcon className="w-3.5 h-3.5" />
        {error}
      </p>
    )}
  </div>
);

export default InputGroup;
