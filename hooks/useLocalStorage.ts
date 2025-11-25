
import React, { useState, useEffect } from 'react';

export function useLocalStorage<T,>(key: string, initialValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      if (typeof window === 'undefined') {
        return initialValue;
      }
      const item = window.localStorage.getItem(key);
      if (item) {
        let parsed: any;
        try {
            parsed = JSON.parse(item);
        } catch(e) {
            console.warn(`Error parsing localStorage key "${key}". Resetting to initial value.`);
            return initialValue;
        }
        
        // Critical fix: Ensure we don't return null/undefined if the parsed value is null/undefined.
        if (parsed === null || parsed === undefined) {
            return initialValue;
        }

        // Type Mismatch Guard: If initialValue is an array but parsed is not, return initial.
        if (Array.isArray(initialValue) && !Array.isArray(parsed)) {
            console.warn(`LocalStorage key "${key}" expected array but got ${typeof parsed}. Resetting.`);
            return initialValue;
        }

        // Type Mismatch Guard: If initialValue is an object (and not array) but parsed is not object, return initial.
        if (typeof initialValue === 'object' && initialValue !== null && !Array.isArray(initialValue)) {
             if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
                 console.warn(`LocalStorage key "${key}" expected object but got ${typeof parsed}. Resetting.`);
                 return initialValue;
             }
        }

        return parsed as T;
      }
      return initialValue;
    } catch (error) {
      console.warn(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        // Guard against storing undefined
        if (storedValue === undefined) {
             window.localStorage.removeItem(key);
        } else {
            const valueToStore = JSON.stringify(storedValue);
            window.localStorage.setItem(key, valueToStore);
        }
      }
    } catch (error) {
      console.warn(`Error writing to localStorage key "${key}":`, error);
    }
  }, [key, storedValue]);

  return [storedValue, setStoredValue];
}
