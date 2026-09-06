import { describe, expect, it } from 'vitest';
import { editTemplate, extractJson, generateTemplate, scripted, suggestSampleData, GenerationError } from '../src/index';

const good = {
  version: 1, id: 'offer', name: 'Offer letter', locale: 'en-GB',
  page: { size: 'A4', orientation: 'portrait', margins: { top: 56, right: 48, bottom: 56, left: 48 } },
  assets: [],
  blocks: [
    { id: 'title', type: 'heading', level: 1, text: 'Offer of employment' },
    { id: 'body', type: 'text', rich: { spans: [{ text: 'Dear {{ candidate.name }}, we are pleased to offer you the role of {{ role.title }} from {{ role.startDate | date:long }}.' }] } },
    { id: 'lines', type: 'dataTable', rowBinding: 'package.items', columns: [{ key: 'k', header: 'Item', cell: '{{ label }}' }, { key: 'v', header: 'Amount', cell: '{{ amount | currency:GHS }}', align: 'right', width: 0.3 }] },
  ],
};
const bad = { ...good, blocks: [{ id: 'title', type: 'heading', level: 1, text: '{{ candidate.name | shout }}' }] };

describe('extractJson', () => {
  it('finds the object inside fences and chatter', () => {
    expect(extractJson('Sure! ```json\n{"a": 1}\n``` done')).toEqual({ a: 1 });
    expect(extractJson('{"a": {"b": [1, 2]}} trailing')).toEqual({ a: { b: [1, 2] } });
    expect(() => extractJson('no json here')).toThrow(/no JSON object/);
  });
});

describe('generateTemplate', () => {
  it('sends the guide and schema, and returns a validated template on the first good answer', async () => {
    const client = scripted([JSON.stringify(good)]);
    const result = await generateTemplate({ client, prompt: 'an employment offer letter', sampleData: { candidate: { name: 'Ama' }, role: { title: 'Designer', startDate: '2026-10-01' }, package: { items: [{ label: 'Salary', amount: 5000 }] } } });
    expect(result.attempts).toBe(1);
    expect(result.model.blocks).toHaveLength(3);
    const call = client.calls[0]!;
    expect(call.system).toContain('"$schema"');
    expect(call.system).toContain('currency:GHS');
    expect(call.messages[0]?.content).toContain('package.items[]');
    expect(call.messages[0]?.content).toContain('role.startDate');
  });

  it('feeds validation issues back and accepts the repaired answer', async () => {
    const client = scripted([JSON.stringify(bad), JSON.stringify(good)]);
    const result = await generateTemplate({ client, prompt: 'anything' });
    expect(result.attempts).toBe(2);
    expect(result.repairs[0]?.[0]).toMatchObject({ path: 'blocks.0.text', message: expect.stringMatching(/Unknown filter "shout"/) });
    expect(client.calls[1]?.messages.at(-1)?.content).toContain('blocks.0.text: Unknown filter "shout"');
  });

  it('gives up with the history after the attempts run out', async () => {
    const client = scripted(['not json', JSON.stringify(bad)]);
    await expect(generateTemplate({ client, prompt: 'anything', attempts: 2 })).rejects.toBeInstanceOf(GenerationError);
  });
});

describe('editTemplate', () => {
  it('sends the current template and the instruction', async () => {
    const client = scripted([JSON.stringify({ ...good, blocks: [good.blocks[0]] })]);
    const result = await editTemplate({ client, model: good as never, instruction: 'remove everything but the title' });
    expect(result.model.blocks).toHaveLength(1);
    expect(client.calls[0]?.messages[0]?.content).toContain('remove everything but the title');
    expect(client.calls[0]?.messages[0]?.content).toContain('"id":"offer"');
  });
});

describe('suggestSampleData', () => {
  it('reports every binding unresolved when no answer parsed, rather than an empty list', async () => {
    const result = await suggestSampleData({ client: scripted(['nope']), model: good as never, attempts: 1 });
    expect(result.data).toEqual({});
    expect(result.unresolved).toEqual(['candidate.name', 'role.title', 'role.startDate', 'package.items']);
  });

  it('treats a non-array fed to a data table as unresolved and sends the warning back', async () => {
    const first = { candidate: { name: 'Ama' }, role: { title: 'Designer', startDate: '2026-10-01' }, package: { items: { label: 'x' } } };
    const second = { ...first, package: { items: [{ label: 'Salary', amount: 5000 }] } };
    const client = scripted([JSON.stringify(first), JSON.stringify(second)]);
    const result = await suggestSampleData({ client, model: good as never });
    expect(result.attempts).toBe(2);
    expect(result.unresolved).toEqual([]);
    expect(client.calls[1]?.messages.at(-1)?.content).toContain('"package.items" is not an array');
    expect(client.calls[0]?.temperature).toBeUndefined();
  });

  it('asks again for bindings the resolver reports as empty', async () => {
    const first = { candidate: { name: 'Ama' }, role: { title: 'Designer' }, package: { items: [{ label: 'Salary', amount: 5000 }] } };
    const second = { ...first, role: { ...first.role, startDate: '2026-10-01' } };
    const client = scripted([JSON.stringify(first), JSON.stringify(second)]);
    const result = await suggestSampleData({ client, model: good as never });
    expect(result.attempts).toBe(2);
    expect(result.unresolved).toEqual([]);
    expect(client.calls[1]?.messages.at(-1)?.content).toContain('No value for "role.startDate"');
  });
});
