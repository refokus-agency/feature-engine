import { describe, it, expect } from 'vitest';
import { exampleFunction } from '../index.ts';

describe('exampleFunction', () => {
  it('should return "Hello World"', () => {
    expect(exampleFunction()).toBe('Hello World');
  });
});