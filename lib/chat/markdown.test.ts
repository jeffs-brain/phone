import { describe, expect, it } from 'bun:test'

import { parseMarkdown, parseMarkdownInlines } from './markdown'

describe('markdown parser', () => {
  it('parses bold, emphasis, and inline code', () => {
    expect(parseMarkdownInlines('A **lamp** with _shade_ and `GU10`.')).toEqual([
      { type: 'text', text: 'A ' },
      { type: 'strong', text: 'lamp' },
      { type: 'text', text: ' with ' },
      { type: 'emphasis', text: 'shade' },
      { type: 'text', text: ' and ' },
      { type: 'code', text: 'GU10' },
      { type: 'text', text: '.' },
    ])
  })

  it('groups unordered list items and keeps inline formatting', () => {
    expect(parseMarkdown([
      'We bought:',
      '',
      '* A **NYMANE lamp**.',
      '* A **KALLAX shelf**.',
    ].join('\n'))).toEqual([
      {
        type: 'paragraph',
        inlines: [{ type: 'text', text: 'We bought:' }],
      },
      {
        type: 'list',
        ordered: false,
        items: [
          {
            inlines: [
              { type: 'text', text: 'A ' },
              { type: 'strong', text: 'NYMANE lamp' },
              { type: 'text', text: '.' },
            ],
          },
          {
            inlines: [
              { type: 'text', text: 'A ' },
              { type: 'strong', text: 'KALLAX shelf' },
              { type: 'text', text: '.' },
            ],
          },
        ],
      },
    ])
  })
})
