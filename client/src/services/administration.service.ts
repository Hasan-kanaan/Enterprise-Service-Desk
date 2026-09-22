import api from './api'
import type {
  AccountStatus,
  Catalog,
  Reference,
  Team,
} from '@/types/administration'
export const updateAccountStatus = async (id: number, status: AccountStatus) =>
  (
    await api.patch<{ id: number; status: AccountStatus }>(
      `/users/${id}/status`,
      { status },
    )
  ).data
export const getOrganization = async (signal?: AbortSignal) => {
  const [regions, departments, specialties, teams] = await Promise.all([
    api.get<Reference[]>('/organization/regions', { signal }),
    api.get<Reference[]>('/organization/departments', { signal }),
    api.get<Reference[]>('/organization/specialties', { signal }),
    api.get<Team[]>('/organization/teams', { signal }),
  ])
  return {
    regions: regions.data,
    departments: departments.data,
    specialties: specialties.data,
    teams: teams.data,
  }
}
export const createReference = async (catalog: Catalog, name: string) =>
  (await api.post<Reference>(`/organization/${catalog}`, { name })).data
export const createTeam = async (
  name: string,
  scope: 'REGION' | 'GLOBAL',
  regionId: number | null,
) =>
  (
    await api.post('/organization/teams', {
      name,
      scope,
      ...(scope === 'REGION' ? { regionId } : {}),
    })
  ).data
export const addMember = async (team: number, user: number) =>
  api.post(`/organization/teams/${team}/members/${user}`)
export const removeMember = async (team: number, user: number) =>
  api.delete(`/organization/teams/${team}/members/${user}`)
export const setTeamLead = async (team: number, user: number) =>
  api.post(`/organization/teams/${team}/lead/${user}`)
export const removeTeamLead = async (team: number) =>
  api.delete(`/organization/teams/${team}/lead`)
export const setTeamManager = async (team: number, user: number) =>
  api.post(`/organization/teams/${team}/manager/${user}`)
export const removeTeamManager = async (team: number) =>
  api.delete(`/organization/teams/${team}/manager`)
