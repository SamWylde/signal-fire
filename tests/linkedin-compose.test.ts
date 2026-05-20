import { describe, expect, it } from 'vitest';

import { getCompanyPageCandidateUrls } from '../src/platforms/linkedin/compose.js';
import { LINKEDIN } from '../src/platforms/linkedin/selectors.js';

describe('LinkedIn compose selectors', () => {
  it('keeps the feed update selector used for publish confirmation', () => {
    expect(LINKEDIN.selectors.feed.sharedUpdateContainer).toBe('.feed-shared-update-v2');
    expect(LINKEDIN.selectors.feed.postPublishedToast).toContain("[role='alert']");
  });

  it('keeps company page compose selectors separate from the personal feed selector', () => {
    expect(LINKEDIN.selectors.companyPage.startPostTrigger).toContain('Create a post');
    expect(LINKEDIN.selectors.companyPage.startPostTriggerXPath).toContain('Start a post');
  });
});

describe('getCompanyPageCandidateUrls', () => {
  it('adds LinkedIn company admin URLs after the provided page URL', () => {
    expect(getCompanyPageCandidateUrls('https://www.linkedin.com/company/acme/')).toEqual([
      'https://www.linkedin.com/company/acme/',
      'https://www.linkedin.com/company/acme/admin/',
      'https://www.linkedin.com/company/acme/admin/dashboard/',
      'https://www.linkedin.com/company/acme/admin/feed/posts/',
    ]);
  });

  it('rejects non-LinkedIn company page URLs', () => {
    expect(() => getCompanyPageCandidateUrls('https://example.com/company/acme/')).toThrow(
      /linkedin\.com/i,
    );
  });
});
