import { describe, expect, it } from 'vitest';

import { isManagementUrl } from '../src/platforms/facebook/compose.js';
import { FACEBOOK } from '../src/platforms/facebook/selectors.js';

describe('Facebook composer helpers', () => {
  it('detects page management URLs', () => {
    expect(isManagementUrl('https://www.facebook.com/profile.php?id=61584434573716')).toBe(true);
    expect(isManagementUrl('https://www.facebook.com/pages/GrantCue/admin/dashboard')).toBe(true);
    expect(isManagementUrl('https://www.facebook.com/GrantCue')).toBe(false);
  });

  it('targets the final Post button inside the Facebook settings dialog', () => {
    const selector = FACEBOOK.selectors.composer.postSubmitButton;

    expect(selector).toContain('[aria-label="Post settings"][role="dialog"]');
    expect(selector).toContain('[aria-label="Post"][role="button"]');
    expect(selector).not.toContain('[aria-label="Back"]');
  });
});
