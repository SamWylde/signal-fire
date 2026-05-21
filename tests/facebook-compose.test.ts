import { describe, expect, it } from 'vitest';

import { isManagementUrl } from '../src/platforms/facebook/compose.js';

describe('Facebook composer helpers', () => {
  it('detects page management URLs', () => {
    expect(isManagementUrl('https://www.facebook.com/profile.php?id=61584434573716')).toBe(true);
    expect(isManagementUrl('https://www.facebook.com/pages/GrantCue/admin/dashboard')).toBe(true);
    expect(isManagementUrl('https://www.facebook.com/GrantCue')).toBe(false);
  });
});
