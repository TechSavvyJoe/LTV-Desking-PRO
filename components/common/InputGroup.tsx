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
        mb-1.5 text-sm font-medium
        text-neutral-700 dark:text-neutral-200
        ${labelClassName}
      `}
    >
      {label}
    </label>
    {children}
    {description && (
      <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{description}</p>
    )}
    {error && (
      <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400 flex items-center gap-1">
        <Icons.ExclamationCircleIcon className="w-3.5 h-3.5" />
        {error}
      </p>
    )}
  </div>
);

export default InputGroup;
