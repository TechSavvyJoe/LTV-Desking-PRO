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
        mb-2 text-sm font-semibold tracking-tight
        text-slate-700 dark:text-slate-200
        ${labelClassName}
      `}
    >
      {label}
    </label>
    {children}
    {description && (
      <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
        {description}
      </p>
    )}
    {error && (
      <p className="mt-1.5 text-xs font-medium text-red-500 dark:text-red-400 flex items-center gap-1">
        <Icons.ExclamationCircleIcon className="w-3.5 h-3.5" />
        {error}
      </p>
    )}
  </div>
);

export default InputGroup;
