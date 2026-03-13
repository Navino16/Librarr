import { test as base, expect, type Page } from '@playwright/test';
import { addCoverageReport } from 'monocart-reporter';

type Fixtures = {
  autoCodeCoverage: void;
};

const test = base.extend<Fixtures>({
  autoCodeCoverage: [async ({ page }: { page: Page }, use: (arg: void) => Promise<void>) => {
    const isChromium = !!page.coverage;
    if (isChromium) {
      await page.coverage.startJSCoverage({ resetOnNavigation: false });
    }

    await use(undefined);

    if (isChromium) {
      const coverage = await page.coverage.stopJSCoverage();
      await addCoverageReport(coverage, test.info());
    }
  }, { auto: true }],
});

export { test, expect };
