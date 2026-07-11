import { describe, it, expect } from 'vitest';
import { jsonRepair } from 'jsonrepair';

describe('JSON Repair Fallback Logic', () => {
  it('should repair unclosed JSON objects', () => {
    const broken = '{"records": [{"_row": 1, "name": "John Doe"';
    const repaired = jsonRepair(broken);
    const parsed = JSON.parse(repaired);
    expect(parsed.records[0].name).toBe('John Doe');
  });

  it('should repair single quotes instead of double quotes', () => {
    const broken = "{'records': [{'_row': 2, 'name': 'Jane'}]}";
    const repaired = jsonRepair(broken);
    const parsed = JSON.parse(repaired);
    expect(parsed.records[0].name).toBe('Jane');
  });

  it('should handle unquoted keys', () => {
    const broken = '{records: [{_row: 3, name: "Alice"}]}';
    const repaired = jsonRepair(broken);
    const parsed = JSON.parse(repaired);
    expect(parsed.records[0].name).toBe('Alice');
  });
});
