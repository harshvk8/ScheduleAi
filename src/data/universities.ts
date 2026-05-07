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
