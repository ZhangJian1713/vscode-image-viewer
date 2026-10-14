import { feedbackUrl, FEEDBACK_EMAIL, ISSUES_URL, REPOSITORY_URL } from './feedback'

test('all existing feedback actions remain available with host-owned destinations', () => {
  expect(feedbackUrl('repository', '2.1.0')).toBe(REPOSITORY_URL)
  expect(feedbackUrl('issues', '2.1.0')).toBe(ISSUES_URL)
  expect(feedbackUrl('newIssue', '2.1.0')).toBe(`${ISSUES_URL}/new`)
  expect(feedbackUrl('email', '2.1.0')).toBe(`mailto:${FEEDBACK_EMAIL}?subject=Image%20Viewer%20v2.1.0%20feedback`)
})
test('webview cannot supply an arbitrary URI or recipient', () => {
  for (const action of ['file:///private', 'command:test', 'https://evil.invalid', 'mailto:other@invalid', null, {}]) {
    expect(() => feedbackUrl(action, '2.1.0')).toThrow()
  }
})
