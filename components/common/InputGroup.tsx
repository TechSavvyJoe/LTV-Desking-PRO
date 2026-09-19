import React, { useId } from "react";
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

/**
 * Label + control + description/error. The error and description are given
 * stable ids and wired onto the (single) child control via aria-describedby,
 * and the error is announced via role="alert", so assistive tech conveys WHY a
 * field is invalid — not just that it is (WCAG 1.3.1 / 3.3.1). [takeover a11y]
 */
const InputGroup: React.FC<InputGroupProps> = ({
  label,
  children,
  htmlFor,
  className = "",
  error,
  labelClassName = "",
  description,
}) => {
  const uid = useId();
  const descriptionId = description ? `${uid}-desc` : undefined;
  const errorId = error ? `${uid}-err` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(" ") || undefined;

  const control =
    describedBy && React.isValidElement(children)
      ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
          "aria-describedby": [
            (children.props as Record<string, unknown>)["aria-describedby"],
            describedBy,
          ]
            .filter(Boolean)
            .join(" "),
          ...(error ? { "aria-invalid": true } : {}),
        })
      : children;

  return (
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
      {control}
      {description && (
        <p id={descriptionId} className="mt-1.5 text-xs text-[var(--color-text-muted)]">
          {description}
        </p>
      )}
      {error && (
        <p
          id={errorId}
          role="alert"
          className="mt-1.5 text-xs font-medium text-[var(--color-danger)] flex items-center gap-1"
        >
          <Icons.ExclamationCircleIcon className="w-3.5 h-3.5" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
};

export default InputGroup;
