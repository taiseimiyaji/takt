/**
 * Tests for facet directory path helpers in paths.ts — items 42–45.
 *
 * Verifies the `facets/` segment is present in all facet path results,
 * and that getEnsembleFacetDir constructs the correct full ensemble path.
 */

import { describe, it, expect } from 'vitest';
import {
  getProjectFacetDir,
  getGlobalFacetDir,
  getBuiltinFacetDir,
  getEnsembleFacetDir,
  getEnsemblePackageDir,
  type FacetType,
} from '../../infra/config/paths.js';

const ALL_FACET_TYPES: FacetType[] = ['personas', 'policies', 'knowledge', 'instructions', 'output-contracts'];

// ---------------------------------------------------------------------------
// getProjectFacetDir — item 42
// ---------------------------------------------------------------------------

describe('getProjectFacetDir — facets/ prefix', () => {
  it('should include "facets" segment in the path', () => {
    // Given: project dir and facet type
    // When: path is built
    const dir = getProjectFacetDir('/my/project', 'personas');

    // Then: path must contain the faceted segment
    const normalized = dir.replace(/\\/g, '/');
    expect(normalized).toContain('facets');
  });

  it('should return .takt/facets/{type} structure', () => {
    // Given: project dir
    // When: path is built
    const dir = getProjectFacetDir('/my/project', 'personas');

    // Then: segment order is .takt → facets → personas
    const normalized = dir.replace(/\\/g, '/');
    expect(normalized).toMatch(/\.takt\/facets\/personas/);
  });

  it('should work for all facet types with facets/ prefix', () => {
    // Given: all valid facet types
    for (const t of ALL_FACET_TYPES) {
      // When: path is built
      const dir = getProjectFacetDir('/proj', t);

      // Then: contains both faceted and the type in the correct order
      const normalized = dir.replace(/\\/g, '/');
      expect(normalized).toMatch(new RegExp(`\\.takt/facets/${t}`));
    }
  });
});

// ---------------------------------------------------------------------------
// getGlobalFacetDir — item 43
// ---------------------------------------------------------------------------

describe('getGlobalFacetDir — facets/ prefix', () => {
  it('should include "facets" segment in the path', () => {
    // Given: facet type
    // When: path is built
    const dir = getGlobalFacetDir('policies');

    // Then: path must contain the faceted segment
    expect(dir).toContain('facets');
  });

  it('should return .takt/facets/{type} structure under global config dir', () => {
    // Given: facet type
    // When: path is built
    const dir = getGlobalFacetDir('policies');

    // Then: segment order is .takt → facets → policies
    const normalized = dir.replace(/\\/g, '/');
    expect(normalized).toMatch(/\.takt\/facets\/policies/);
  });

  it('should work for all facet types with facets/ prefix', () => {
    // Given: all valid facet types
    for (const t of ALL_FACET_TYPES) {
      // When: path is built
      const dir = getGlobalFacetDir(t);

      // Then: contains both faceted and the type in the correct order
      const normalized = dir.replace(/\\/g, '/');
      expect(normalized).toMatch(new RegExp(`\\.takt/facets/${t}`));
    }
  });
});

// ---------------------------------------------------------------------------
// getBuiltinFacetDir — item 44
// ---------------------------------------------------------------------------

describe('getBuiltinFacetDir — facets/ prefix', () => {
  it('should include "facets" segment in the path', () => {
    // Given: language and facet type
    // When: path is built
    const dir = getBuiltinFacetDir('ja', 'knowledge');

    // Then: path must contain the faceted segment
    expect(dir).toContain('facets');
  });

  it('should return {lang}/facets/{type} structure', () => {
    // Given: language and facet type
    // When: path is built
    const dir = getBuiltinFacetDir('ja', 'knowledge');

    // Then: segment order is ja → facets → knowledge
    const normalized = dir.replace(/\\/g, '/');
    expect(normalized).toMatch(/ja\/facets\/knowledge/);
  });

  it('should work for all facet types with facets/ prefix', () => {
    // Given: all valid facet types
    for (const t of ALL_FACET_TYPES) {
      // When: path is built
      const dir = getBuiltinFacetDir('en', t);

      // Then: contains both faceted and the type in the correct order
      const normalized = dir.replace(/\\/g, '/');
      expect(normalized).toMatch(new RegExp(`en/facets/${t}`));
    }
  });
});

// ---------------------------------------------------------------------------
// getEnsembleFacetDir — item 45 (new function)
// ---------------------------------------------------------------------------

describe('getEnsembleFacetDir — new path function', () => {
  it('should return path containing ensemble/@{owner}/{repo}/facets/{type}', () => {
    // Given: owner, repo, and facet type
    // When: path is built
    const dir = getEnsembleFacetDir('nrslib', 'takt-fullstack', 'personas');

    // Then: all segments are present
    const normalized = dir.replace(/\\/g, '/');
    expect(normalized).toContain('ensemble');
    expect(normalized).toContain('@nrslib');
    expect(normalized).toContain('takt-fullstack');
    expect(normalized).toContain('facets');
    expect(normalized).toContain('personas');
  });

  it('should construct path as ~/.takt/ensemble/@{owner}/{repo}/facets/{type}', () => {
    // Given: owner, repo, and facet type
    // When: path is built
    const dir = getEnsembleFacetDir('nrslib', 'takt-fullstack', 'personas');

    // Then: full segment order is ensemble → @nrslib → takt-fullstack → facets → personas
    const normalized = dir.replace(/\\/g, '/');
    expect(normalized).toMatch(/ensemble\/@nrslib\/takt-fullstack\/facets\/personas/);
  });

  it('should prepend @ before owner name in the path', () => {
    // Given: owner without @ prefix
    // When: path is built
    const dir = getEnsembleFacetDir('myowner', 'myrepo', 'policies');

    // Then: @ is included before owner in the path
    const normalized = dir.replace(/\\/g, '/');
    expect(normalized).toContain('@myowner');
  });

  it('should work for all facet types', () => {
    // Given: all valid facet types
    for (const t of ALL_FACET_TYPES) {
      // When: path is built
      const dir = getEnsembleFacetDir('owner', 'repo', t);

      // Then: path has correct ensemble structure with facet type
      const normalized = dir.replace(/\\/g, '/');
      expect(normalized).toMatch(new RegExp(`ensemble/@owner/repo/facets/${t}`));
    }
  });
});

// ---------------------------------------------------------------------------
// getEnsemblePackageDir — item 46
// ---------------------------------------------------------------------------

describe('getEnsemblePackageDir', () => {
  it('should return path containing ensemble/@{owner}/{repo}', () => {
    // Given: owner and repo
    // When: path is built
    const dir = getEnsemblePackageDir('nrslib', 'takt-fullstack');

    // Then: all segments are present
    const normalized = dir.replace(/\\/g, '/');
    expect(normalized).toContain('ensemble');
    expect(normalized).toContain('@nrslib');
    expect(normalized).toContain('takt-fullstack');
  });

  it('should construct path as ~/.takt/ensemble/@{owner}/{repo}', () => {
    // Given: owner and repo
    // When: path is built
    const dir = getEnsemblePackageDir('nrslib', 'takt-fullstack');

    // Then: full segment order is ensemble → @nrslib → takt-fullstack
    const normalized = dir.replace(/\\/g, '/');
    expect(normalized).toMatch(/ensemble\/@nrslib\/takt-fullstack$/);
  });

  it('should prepend @ before owner name in the path', () => {
    // Given: owner without @ prefix
    // When: path is built
    const dir = getEnsemblePackageDir('myowner', 'myrepo');

    // Then: @ is included before owner in the path
    const normalized = dir.replace(/\\/g, '/');
    expect(normalized).toContain('@myowner');
  });
});
