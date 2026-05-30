import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/core/browser.js', () => ({ isLocatorVisible: vi.fn() }));
vi.mock('../src/core/mouse.js', () => ({ humanClick: vi.fn() }));

import { isLocatorVisible } from '../src/core/browser.js';
import { clickFirstVisible } from '../src/core/locators.js';
import { humanClick } from '../src/core/mouse.js';

const mockVisible = vi.mocked(isLocatorVisible);
const mockClick = vi.mocked(humanClick);

type Candidate = { name: string; ancestor: { name: string }; locator: () => { name: string } };
function fakeLocator(name: string): { first: () => Candidate } {
  const ancestor = { name: `${name}#ancestor` };
  const candidate: Candidate = { name, ancestor, locator: vi.fn(() => ancestor) };
  return { first: () => candidate };
}
const page = {} as never;

beforeEach(() => {
  mockVisible.mockReset();
  mockClick.mockReset();
});

describe('clickFirstVisible', () => {
  it('first visible wins', async () => {
    const loc1 = fakeLocator('a');
    const loc2 = fakeLocator('b');
    mockVisible.mockResolvedValueOnce(true);
    mockClick.mockResolvedValue(undefined);

    const result = await clickFirstVisible(
      page,
      [loc1, loc2] as unknown as Parameters<typeof clickFirstVisible>[1],
      100,
    );

    expect(result).toBe(true);
    expect(mockClick).toHaveBeenCalledTimes(1);
    expect(mockClick).toHaveBeenCalledWith(page, loc1.first());
  });

  it('none visible → false', async () => {
    const loc1 = fakeLocator('a');
    const loc2 = fakeLocator('b');
    mockVisible.mockResolvedValue(false);

    const result = await clickFirstVisible(
      page,
      [loc1, loc2] as unknown as Parameters<typeof clickFirstVisible>[1],
      100,
    );

    expect(result).toBe(false);
    expect(mockClick).not.toHaveBeenCalled();
  });

  it('tryAncestor retries the ancestor on click failure', async () => {
    const loc = fakeLocator('a');
    const candidate = loc.first();
    mockVisible.mockResolvedValue(true);
    mockClick.mockRejectedValueOnce(new Error('intercepted')).mockResolvedValueOnce(undefined);

    const result = await clickFirstVisible(
      page,
      [loc] as unknown as Parameters<typeof clickFirstVisible>[1],
      100,
      { tryAncestor: true },
    );

    expect(result).toBe(true);
    expect(mockClick).toHaveBeenCalledTimes(2);
    expect(mockClick.mock.calls[1]?.[1]).toBe(candidate.ancestor);
  });

  it('without tryAncestor a failing click propagates', async () => {
    const loc = fakeLocator('a');
    mockVisible.mockResolvedValue(true);
    mockClick.mockRejectedValue(new Error('boom'));

    await expect(
      clickFirstVisible(page, [loc] as unknown as Parameters<typeof clickFirstVisible>[1], 100),
    ).rejects.toThrow('boom');
  });

  it('tryAncestor: candidate+ancestor both fail → moves to next locator', async () => {
    const loc1 = fakeLocator('a');
    const loc2 = fakeLocator('b');
    mockVisible.mockResolvedValue(true);
    mockClick
      .mockRejectedValueOnce(new Error('candidate fail'))
      .mockRejectedValueOnce(new Error('ancestor fail'))
      .mockResolvedValueOnce(undefined);

    const result = await clickFirstVisible(
      page,
      [loc1, loc2] as unknown as Parameters<typeof clickFirstVisible>[1],
      100,
      { tryAncestor: true },
    );

    expect(result).toBe(true);
    expect(mockClick).toHaveBeenCalledTimes(3);
  });
});
