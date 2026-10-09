import React, { createContext, useContext, useMemo } from 'react';
import { normalizeWebsiteRecord, mergeRecords } from '../unifiedRecords.js';
export const UnifiedSectionContext = createContext({ records: {}, refresh: () => {}, ready: false });
export function useUnifiedRecords(local, resource) {
  const { records } = useContext(UnifiedSectionContext);
  return useMemo(() => mergeRecords(local, (records[resource]?.rows || []).map(row => normalizeWebsiteRecord(resource, row)), resource), [local, records, resource]);
}
export function useUnifiedCatalog(local) {
  const universities = useUnifiedRecords(local.universities || [], 'universities');
  const programs = useUnifiedRecords(local.programs || [], 'programs');
  const countries = useUnifiedRecords((local.countries || []).map(row => typeof row === 'string' ? { id:`crm-country:${row}`, name:row } : row), 'countries');
  return { ...local, universities, programs, countries, summary: { ...local.summary, universities: universities.length, programs: programs.length, countries: countries.length } };
}
