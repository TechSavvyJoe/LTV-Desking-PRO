
import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

const Button: React.FC<ButtonProps> = ({ children, variant = 'primary', size = 'md', className = '', ...props }) => {
  const baseClasses = 'inline-flex items-center justify-center rounded-lg font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-x-black disabled:opacity-50 disabled:pointer-events-none';

  const variantClasses = {
    primary: 'bg-x-blue text-white hover:bg-x-blue/90 focus:ring-x-blue',
    secondary: 'border border-x-text-primary/50 text-x-text-primary hover:bg-x-text-primary/10 focus:ring-x-text-primary',
    danger: 'border border-red-500/50 text-red-500 hover:bg-red-500/10 focus:ring-red-500',
    ghost: 'bg-transparent text-x-text-secondary hover:bg-x-hover-light hover:text-x-text-primary'
  };

  const sizeClasses = {
    sm: 'px-3 py-1 text-xs',
    md: 'px-5 py-2 text-sm',
    lg: 'px-7 py-3 text-base'
  };

  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

export default Button;