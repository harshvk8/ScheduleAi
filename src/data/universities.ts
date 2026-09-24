export interface University {
  id: string;
  name: string;
  location: string;
  domain: string;
}

export const UNIVERSITIES: University[] = [
  { id: 'msu',      name: 'Montclair State University',             location: 'Montclair, NJ',     domain: 'montclair.edu' },
  { id: 'rutgers',  name: 'Rutgers University',                     location: 'New Brunswick, NJ', domain: 'rutgers.edu'   },
  { id: 'njit',     name: 'New Jersey Institute of Technology',     location: 'Newark, NJ',        domain: 'njit.edu'      },
  { id: 'kean',     name: 'Kean University',                        location: 'Union, NJ',         domain: 'kean.edu'      },
  { id: 'rowan',    name: 'Rowan University',                       location: 'Glassboro, NJ',     domain: 'rowan.edu'     },
  { id: 'nyu',      name: 'New York University',                    location: 'New York, NY',      domain: 'nyu.edu'       },
  { id: 'columbia', name: 'Columbia University',                    location: 'New York, NY',      domain: 'columbia.edu'  },
  { id: 'fordham',  name: 'Fordham University',                     location: 'Bronx, NY',         domain: 'fordham.edu'   },
];

export function getUniversity(id: string): University | undefined {
  return UNIVERSITIES.find((u) => u.id === id);
}

export const OTHER_UNIVERSITY_ID = 'other';

// Custom, user-typed university (not in our list). No known domain, so we
// can't enforce an @school.edu email suffix for these — see student/info/page.tsx.
export function buildCustomUniversity(name: string): University {
  const trimmed = name.trim();
  const slug = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return { id: `${OTHER_UNIVERSITY_ID}-${slug || 'university'}`, name: trimmed, location: '', domain: '' };
}
