import { expect, test } from 'vitest'
import {
  compareSuggestions,
  comparisonPassages,
  listEdits,
  presentDecisions,
  resolvedField,
  type BlockNode,
  type InlineNode,
} from '@/lib/ai/suggestion-diff'

function runs(nodes: InlineNode[], into: { mark: string; text: string }[] = []) {
  for (const node of nodes) {
    if (node.type === 'text') into.push({ mark: node.mark, text: node.text })
    else if (node.type === 'link' || node.type === 'format') runs(node.children, into)
  }
  return into
}

function blockRuns(blocks: BlockNode[]) {
  const into: { mark: string; text: string }[] = []
  const walk = (list: BlockNode[]) => {
    for (const block of list) {
      if (block.type === 'block') runs(block.children, into)
      else if (block.type === 'list') {
        for (const item of block.items) {
          runs(item.children, into)
          walk(item.blocks)
        }
      } else if (block.type === 'table') {
        for (const row of block.rows) for (const cell of row.cells) runs(cell.children, into)
      }
    }
  }
  walk(blocks)
  return into
}

function joined(blocks: BlockNode[], mark: string) {
  return blockRuns(blocks)
    .filter((run) => run.mark === mark)
    .map((run) => run.text)
    .join('')
}

function links(nodes: InlineNode[], into: { href: string; runs: { mark: string; text: string }[] }[] = []) {
  for (const node of nodes) {
    if (node.type === 'link') into.push({ href: node.href, runs: runs(node.children) })
    else if (node.type === 'format') links(node.children, into)
  }
  return into
}

test('word changes, insertions, and deletions leave the rest of the sentence unchanged', () => {
  const changed = compareSuggestions('<p>The deadline is October 30.</p>', '<p>The deadline is October 31.</p>')
  expect(joined(changed.changes, 'removed')).toBe('30')
  expect(joined(changed.changes, 'added')).toBe('31')
  expect(joined(changed.changes, 'same')).toContain('The deadline is October')
  expect(joined(changed.changes, 'same')).toContain('.')
  expect(joined(changed.changes, 'removed')).not.toContain('deadline')

  const inserted = compareSuggestions(
    '<p>The deadline is October 30.</p>',
    '<p>The application deadline is October 30.</p>',
  )
  expect(joined(inserted.changes, 'added')).toContain('application')
  expect(joined(inserted.changes, 'same')).toContain('deadline')
  expect(joined(inserted.changes, 'removed')).toBe('')

  const deleted = compareSuggestions(
    '<p>The application deadline is October 30.</p>',
    '<p>The deadline is October 30.</p>',
  )
  expect(joined(deleted.changes, 'removed')).toContain('application')
  expect(joined(deleted.changes, 'same')).toContain('deadline is October 30')
})

test('unchanged wording has no additions or deletions', () => {
  const views = compareSuggestions('<p>The deadline is October 30.</p>', '<p>The deadline is October 30.</p>')
  expect(joined(views.changes, 'added')).toBe('')
  expect(joined(views.changes, 'removed')).toBe('')
  expect(joined(views.changes, 'same')).toContain('The deadline is October 30.')
  expect(blockRuns(views.original).every((run) => run.mark === 'same')).toBe(true)
  expect(blockRuns(views.proposed).every((run) => run.mark === 'same')).toBe(true)
})

test('punctuation and repeated words are marked on their own', () => {
  const punctuation = compareSuggestions('The deadline is October 30.', 'The deadline is October 30')
  expect(joined(punctuation.changes, 'removed')).toBe('.')
  expect(joined(punctuation.changes, 'same')).toContain('30')
  expect(joined(punctuation.changes, 'added')).toBe('')

  const hyphen = compareSuggestions('The well-known deadline stands.', 'The well known deadline stands.')
  expect(joined(hyphen.changes, 'same')).toContain('deadline')
  expect(joined(hyphen.changes, 'removed')).toContain('well-known')
  expect(joined(hyphen.changes, 'added')).toContain('well')
  expect(joined(hyphen.changes, 'added')).toContain('known')

  const repeated = compareSuggestions('<p>the the deadline</p>', '<p>the deadline</p>')
  expect(joined(repeated.changes, 'removed').replace(/\s+/g, ' ').trim()).toBe('the')
  expect(joined(repeated.changes, 'same')).toContain('the')
  expect(joined(repeated.changes, 'same')).toContain('deadline')
  expect(joined(repeated.changes, 'added')).toBe('')
})

test('entities are decoded and a changed sentence does not replace the other paragraph', () => {
  const entities = compareSuggestions('<p>Research &amp; development</p>', '<p>Research and development</p>')
  expect(JSON.stringify(entities)).not.toContain('&amp;')
  expect(JSON.stringify(entities)).not.toContain('<p>')
  expect(joined(entities.changes, 'removed')).toContain('&')
  expect(joined(entities.changes, 'added')).toContain('and')
  expect(joined(entities.changes, 'same')).toContain('Research')
  expect(joined(entities.changes, 'same')).toContain('development')

  const paragraphs = compareSuggestions(
    '<p>First sentence stays.</p><p>The deadline is October 30.</p>',
    '<p>First sentence stays.</p><p>The deadline is October 31.</p>',
  )
  expect(paragraphs.changes).toHaveLength(2)
  expect(paragraphs.changes[0].type).toBe('block')
  if (paragraphs.changes[0].type === 'block') {
    expect(runs(paragraphs.changes[0].children).every((run) => run.mark === 'same')).toBe(true)
    expect(joined([paragraphs.changes[0]], 'same')).toContain('First sentence stays.')
  }
  expect(joined([paragraphs.changes[1]], 'removed')).toBe('30')
  expect(joined([paragraphs.changes[1]], 'added')).toBe('31')
  expect(joined([paragraphs.changes[1]], 'same')).toContain('deadline')
})

test('lists, links, and tables keep their structure while text changes', () => {
  const list = compareSuggestions(
    '<ul><li>Alpha item</li><li>Beta item</li></ul>',
    '<ul><li>Alpha item</li><li>Beta task</li></ul>',
  )
  expect(list.changes[0].type).toBe('list')
  expect(joined([list.changes[0]], 'same')).toContain('Alpha item')
  expect(joined([list.changes[0]], 'same')).toContain('Beta')
  expect(joined([list.changes[0]], 'removed')).toContain('item')
  expect(joined([list.changes[0]], 'added')).toContain('task')

  const linked = compareSuggestions(
    '<p>See the <a href="https://gradschool.wsu.edu/dates">deadline</a> today.</p>',
    '<p>See the <a href="https://gradschool.wsu.edu/dates">application deadline</a> today.</p>',
  )
  expect(linked.changes[0].type).toBe('block')
  const found = linked.changes[0].type === 'block' ? links(linked.changes[0].children) : []
  expect(found).toHaveLength(1)
  expect(found[0].href).toBe('https://gradschool.wsu.edu/dates')
  expect(found[0].runs.some((run) => run.mark === 'added' && run.text.includes('application'))).toBe(true)
  expect(found[0].runs.some((run) => run.mark === 'same' && run.text.includes('deadline'))).toBe(true)
  expect(JSON.stringify(linked)).not.toContain('<a')

  const table = compareSuggestions(
    '<table><tr><td>Room 101</td><td>9 a.m.</td></tr></table>',
    '<table><tr><td>Room 202</td><td>9 a.m.</td></tr></table>',
  )
  expect(table.changes[0].type).toBe('table')
  expect(joined(table.changes, 'same')).toContain('Room')
  expect(joined(table.changes, 'same')).toContain('9 a.m.')
  expect(joined(table.changes, 'removed')).toContain('101')
  expect(joined(table.changes, 'added')).toContain('202')
})

test('a rewritten sentence stays together instead of alternating word by word', () => {
  const views = compareSuggestions(
    '<p>Placeholder body copy for a standard item.</p>',
    '<p>A proposal that must not be applied.</p>',
  )
  const marks = blockRuns(views.changes).map((run) => run.mark)
  const addedAt = marks.indexOf('added')
  expect(addedAt).toBeGreaterThan(marks.indexOf('removed'))
  expect(marks.slice(0, addedAt).every((mark) => mark === 'removed')).toBe(true)
  expect(joined(views.changes, 'removed')).toContain('Placeholder body copy for a standard item')
  expect(joined(views.changes, 'added')).toContain('A proposal that must not be applied')
})

test('unsafe markup is removed before the comparison is built', () => {
  const views = compareSuggestions(
    '<p>Hello</p><script>alert(1)</script>',
    '<p>Hello</p><img src="javascript:alert(1)" alt="Campus"><a href="javascript:alert(1)">click</a>',
  )
  const serialized = JSON.stringify(views)
  expect(serialized).not.toContain('alert')
  expect(serialized).not.toContain('<script')
  expect(serialized).not.toContain('javascript:')
  expect(serialized).toContain('Hello')
  expect(serialized).toContain('click')
  expect(Array.isArray(views.proposed)).toBe(true)
  expect(views.proposed).not.toContain('<p>Hello</p>')
})

test('individual edits can be accepted or passed without rewriting the source strings', () => {
  const original = '<p>Placeholder body copy for a standard item.</p>'
  const proposed = '<p>Placeholder body text for a revised item.</p>'
  const views = compareSuggestions(original, proposed)
  const edits = listEdits(views.changes)
  expect(edits.map((edit) => `${edit.removed} to ${edit.added}`)).toEqual(['copy to text', 'standard to revised'])

  expect(resolvedField(original, proposed, {})).toBe(proposed)
  expect(resolvedField(original, proposed, { [edits[0].id]: 'accept', [edits[1].id]: 'accept' })).toBe(proposed)

  const passedFirst = resolvedField(original, proposed, { [edits[0].id]: 'pass' })
  expect(passedFirst).toContain('Placeholder body copy for a revised item.')
  expect(passedFirst).not.toContain('text')
  expect(passedFirst).not.toContain('<ins')
  expect(passedFirst).not.toContain('<del')
  expect(passedFirst).not.toContain(edits[0].id)

  const passedSecond = resolvedField(original, proposed, { [edits[1].id]: 'pass' })
  expect(passedSecond).toContain('Placeholder body text for a standard item.')
  expect(passedSecond).not.toContain('revised')

  expect(original).toBe('<p>Placeholder body copy for a standard item.</p>')
  expect(proposed).toBe('<p>Placeholder body text for a revised item.</p>')
  expect(joined(views.changes, 'removed')).toContain('copy')
  expect(joined(presentDecisions(views.changes, { [edits[0].id]: 'pass' }), 'removed')).not.toContain('copy')
})

test('passing an insertion, deletion, or punctuation change keeps the other words', () => {
  const inserted = compareSuggestions(
    '<p>The deadline is October 30.</p>',
    '<p>The application deadline is October 30.</p>',
  )
  const insertion = listEdits(inserted.changes)
  expect(insertion).toHaveLength(1)
  const insertedHtml = resolvedField(
    '<p>The deadline is October 30.</p>',
    '<p>The application deadline is October 30.</p>',
    { [insertion[0].id]: 'pass' },
  )
  expect(insertedHtml).toContain('The deadline is October 30.')
  expect(insertedHtml).not.toContain('application')

  const deleted = listEdits(
    compareSuggestions('<p>The application deadline is October 30.</p>', '<p>The deadline is October 30.</p>').changes,
  )
  expect(
    resolvedField('<p>The application deadline is October 30.</p>', '<p>The deadline is October 30.</p>', {
      [deleted[0].id]: 'pass',
    }),
  ).toContain('application')

  const plainOriginal = 'The deadline is October 30.'
  const plainProposed = 'The deadline is October 30'
  const period = listEdits(compareSuggestions(plainOriginal, plainProposed).changes)
  expect(resolvedField(plainOriginal, plainProposed, {}, true)).toBe(plainProposed)
  expect(resolvedField(plainOriginal, plainProposed, { [period[0].id]: 'pass' }, true)).toBe(plainOriginal)
  expect(resolvedField(plainOriginal, plainProposed, { [period[0].id]: 'pass' }, true)).not.toContain('<')
})

test('repeated words, entities, links, and styled text stay separate and safe', () => {
  const repeatedOriginal = '<p>the cat and the dog</p>'
  const repeatedProposed = '<p>the kitten and the puppy</p>'
  const repeated = listEdits(compareSuggestions(repeatedOriginal, repeatedProposed).changes)
  expect(repeated).toHaveLength(2)
  const onePass = resolvedField(repeatedOriginal, repeatedProposed, { [repeated[0].id]: 'pass' })
  expect(onePass).toContain('the cat and the puppy')
  expect(onePass).not.toContain('kitten')
  expect(onePass).not.toContain('dog')

  const entityOriginal = '<p>Research &amp; development</p>'
  const entityProposed = '<p>Research and development</p>'
  const entity = listEdits(compareSuggestions(entityOriginal, entityProposed).changes)[0]
  const keptEntity = resolvedField(entityOriginal, entityProposed, { [entity.id]: 'pass' })
  expect(keptEntity).toContain('&amp;')
  expect(keptEntity).not.toContain('>and<')
  expect(keptEntity).not.toContain('<ins')
  expect(entityOriginal).toBe('<p>Research &amp; development</p>')

  const linkOriginal = '<p>See the <a href="https://gradschool.wsu.edu/dates">deadline</a> today.</p>'
  const linkProposed = '<p>See the <a href="https://gradschool.wsu.edu/dates">application deadline</a> today.</p>'
  const link = listEdits(compareSuggestions(linkOriginal, linkProposed).changes)[0]
  const keptLink = resolvedField(linkOriginal, linkProposed, { [link.id]: 'pass' })
  expect(keptLink).toContain('https://gradschool.wsu.edu/dates')
  expect(keptLink).toContain('deadline')
  expect(keptLink).not.toContain('application')
  expect(keptLink).not.toContain('javascript:')

  const styledOriginal = '<p style="text-align:center">The deadline is October 30.</p>'
  const styledProposed = '<p style="text-align:center">The deadline is October 31.</p>'
  const styled = listEdits(compareSuggestions(styledOriginal, styledProposed).changes)[0]
  const keptStyle = resolvedField(styledOriginal, styledProposed, { [styled.id]: 'pass' })
  expect(keptStyle).toMatch(/text-align:\s*center/)
  expect(keptStyle).toContain('30')
  expect(keptStyle).not.toContain('31')

  const tableOriginal = '<table><tr><td>Room 101</td><td>9 a.m.</td></tr></table>'
  const tableProposed = '<table><tr><td>Room 202</td><td>9 a.m.</td></tr></table>'
  const table = listEdits(compareSuggestions(tableOriginal, tableProposed).changes)[0]
  const keptRoom = resolvedField(tableOriginal, tableProposed, { [table.id]: 'pass' })
  expect(keptRoom).toContain('101')
  expect(keptRoom).toContain('9 a.m.')
  expect(keptRoom).not.toContain('202')
  expect(keptRoom).not.toContain('<del')

  const unsafe = resolvedField(
    '<p>Hello</p><script>alert(1)</script>',
    '<p>Hello there</p><img src="javascript:alert(1)" alt="Campus">',
    { e1: 'pass' },
  )
  expect(unsafe).not.toContain('alert')
  expect(unsafe).not.toContain('<script')
  expect(unsafe).not.toContain('javascript:')
  expect(unsafe).toContain('Hello')
})

test('comparison passages keep replacements together and retain surrounding reading order', () => {
  const replacement = compareSuggestions('<p>Old text.</p>', '<h2>New heading.</h2>').changes
  const before = compareSuggestions('<p>Before.</p>', '<p>Before.</p>').changes
  const after = compareSuggestions('<p>After.</p>', '<p>After.</p>').changes
  const groups = comparisonPassages([...before, ...replacement, ...after])
  expect(groups).toHaveLength(3)
  expect(groups[1]).toHaveLength(2)
  expect(listEdits(groups[1])).toHaveLength(1)
  expect(comparisonPassages(compareSuggestions('<p>One.</p><p>Two.</p>', '<p>First.</p><p>Second.</p>').changes)).toHaveLength(2)
})
