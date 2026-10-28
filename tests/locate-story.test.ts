import { expect, test } from 'vitest'
import { defaultFFModel } from '@/lib/defaults'
import { storyForFinding, storyForIssue } from '@/lib/client/locate-story'

test('accessibility issues open the story containing their text, link, or image', () => {
  const data = defaultFFModel()
  expect(storyForIssue(data, 'Text: Sample Announcement')).toEqual({ sectionIndex: 0, cardIndex: 0 })
  expect(storyForIssue(data, 'Headings')).toBeNull()
  expect(storyForIssue(data, 'Document')).toBeNull()
  expect(storyForIssue(data, 'Text appearing in no story at all')).toBeNull()
})

test('review findings resolve by section key when positions move', () => {
  const data = defaultFFModel()
  const finding = { sectionKey: 'deadlines', sectionIndex: 0, cardIndex: 0, field: 'body_html' }
  expect(storyForFinding(data, finding)).toEqual({ sectionIndex: 0, cardIndex: 0 })
  const moved = { ...data, sections: [data.sections[1], data.sections[0], ...data.sections.slice(2)] }
  expect(storyForFinding(moved, finding)).toEqual({ sectionIndex: 1, cardIndex: 0 })
  expect(storyForFinding(data, { ...finding, field: 'preheader', cardIndex: null })).toBeNull()
  expect(storyForFinding(data, { ...finding, cardIndex: 99 })).toBeNull()
})
