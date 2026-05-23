import { describe, expect, it } from 'vitest';

import { hasInstagramShareConfirmationText } from '../src/platforms/instagram/composer.js';
import { INSTAGRAM } from '../src/platforms/instagram/selectors.js';

describe('Instagram composer helpers', () => {
  it('recognizes the post-shared success screen copy', () => {
    expect(hasInstagramShareConfirmationText('Post shared Your post has been shared. Done')).toBe(
      true,
    );
    expect(hasInstagramShareConfirmationText('Create new post Share')).toBe(false);
  });

  it('keeps success selectors aligned to the Instagram confirmation dialog', () => {
    expect(INSTAGRAM.selectors.composer.shareConfirmationHeading).toBe('Post shared');
    expect(INSTAGRAM.selectors.composer.shareConfirmationText).toBe('Your post has been shared.');
    expect(INSTAGRAM.selectors.composer.doneButton).toContain('Done');
  });
});
