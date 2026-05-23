import { describe, expect, it } from 'vitest';

import {
  extractLinkedInCompanyIdFromUrl,
  getCompanyPageCandidateUrls,
  isLinkedInCompanyPublishedUrl,
} from '../src/platforms/linkedin/compose.js';
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

  it('keeps the company-share post button selector native CSS compatible', () => {
    expect(LINKEDIN.selectors.companyShare.postButton).toBe(
      'button.share-actions__primary-action, button.artdeco-button--primary',
    );
    expect(LINKEDIN.selectors.companyShare.postButton).not.toMatch(/:has-text|:text-is/);
  });

  it('keeps company-share success copy for publish confirmation', () => {
    expect(LINKEDIN.selectors.companyShare.successText).toBe('Post successful.');
    expect(LINKEDIN.selectors.companyShare.viewPostText).toBe('View post');
  });
});

describe('getCompanyPageCandidateUrls', () => {
  it('adds LinkedIn company admin URLs after the provided page URL', () => {
    expect(getCompanyPageCandidateUrls('https://www.linkedin.com/company/acme/')).toEqual([
      'https://www.linkedin.com/company/acme/',
      'https://www.linkedin.com/company/acme/admin/page-posts/published/?share=true',
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

  it('extracts numeric LinkedIn company IDs from page URLs for the direct share composer', () => {
    expect(extractLinkedInCompanyIdFromUrl('https://www.linkedin.com/company/110105724/')).toBe(
      '110105724',
    );
    expect(extractLinkedInCompanyIdFromUrl('https://www.linkedin.com/company/grantcue/')).toBe(
      'grantcue',
    );
  });

  it('recognizes the post-submit company published URL without the share query', () => {
    expect(
      isLinkedInCompanyPublishedUrl(
        'https://www.linkedin.com/company/110105724/admin/page-posts/published/',
      ),
    ).toBe(true);
    expect(
      isLinkedInCompanyPublishedUrl(
        'https://www.linkedin.com/company/110105724/admin/page-posts/published/?share=true',
      ),
    ).toBe(false);
    expect(isLinkedInCompanyPublishedUrl('https://example.com/company/110105724/')).toBe(false);
    expect(
      isLinkedInCompanyPublishedUrl(
        'https://notlinkedin.com/company/110105724/admin/page-posts/published/',
      ),
    ).toBe(false);
  });
});
