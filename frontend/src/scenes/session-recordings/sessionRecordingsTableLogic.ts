import { kea } from 'kea'
import api from 'lib/api'
import { toParams } from 'lib/utils'
import {
    AnyPropertyFilter,
    EntityTypes,
    FilterType,
    PropertyOperator,
    RecordingDurationFilter,
    RecordingFilters,
    SessionRecordingId,
    SessionRecordingsResponse,
} from '~/types'
import { sessionRecordingsTableLogicType } from './sessionRecordingsTableLogicType'
import { router } from 'kea-router'
import { eventUsageLogic, RecordingWatchedSource } from 'lib/utils/eventUsageLogic'
import equal from 'fast-deep-equal'
import { teamLogic } from '../teamLogic'
import { SessionRecordingType } from '~/types'
import { featureFlagLogic } from 'lib/logic/featureFlagLogic'
import { FEATURE_FLAGS } from 'lib/constants'

export type PersonUUID = string

interface HashParams {
    sessionRecordingId?: SessionRecordingId
    recordingFilters?: RecordingFilters
    source?: RecordingWatchedSource
}

export enum RecordingTableLocation {
    RecordingsPage = 'recordings_page',
    HomePage = 'home_page',
    PersonPage = 'person_page',
}

const LIMIT = 50

export const DEFAULT_DURATION_FILTER: RecordingDurationFilter = {
    type: 'recording',
    key: 'duration',
    value: 60,
    operator: PropertyOperator.GreaterThan,
}

export const DEFAULT_PROPERTY_FILTERS = []

export const DEFAULT_ENTITY_FILTERS = {
    events: [],
    actions: [],
    new_entity: [
        {
            id: null,
            type: EntityTypes.EVENTS,
            order: 0,
            name: null,
        },
    ],
}

export const DEFAULT_FROM_DATE = '-21d'

export const sessionRecordingsTableLogic = kea<sessionRecordingsTableLogicType<PersonUUID, RecordingTableLocation>>({
    path: (key) => ['scenes', 'session-recordings', 'sessionRecordingsTableLogic', key],
    key: (props) => props.personUUID || props.tableLocation || 'global',
    props: {} as {
        personUUID?: PersonUUID
        tableLocation?: RecordingTableLocation
        disableFiltering?: boolean
    },
    connect: {
        values: [teamLogic, ['currentTeamId']],
        actions: [eventUsageLogic, ['reportRecordingsListFetched', 'reportRecordingsListFilterAdded']],
    },
    actions: {
        getSessionRecordings: true,
        openSessionPlayer: (sessionRecordingId: SessionRecordingId | null, source: RecordingWatchedSource) => ({
            sessionRecordingId,
            source,
        }),
        closeSessionPlayer: true,
        setEntityFilters: (filters: Partial<FilterType>) => ({ filters }),
        setPropertyFilters: (filters: AnyPropertyFilter[]) => {
            return { filters }
        },
        loadNext: true,
        loadPrev: true,
        enableFilter: true,
        setOffset: (offset: number) => ({ offset }),
        setDateRange: (incomingFromDate: string | undefined, incomingToDate: string | undefined) => ({
            incomingFromDate,
            incomingToDate,
        }),
        setDurationFilter: (durationFilter: RecordingDurationFilter) => ({ durationFilter }),
    },
    loaders: ({ props, values, actions }) => ({
        sessionRecordingsResponse: [
            {
                results: [],
                has_next: false,
            } as SessionRecordingsResponse,
            {
                getSessionRecordings: async (_, breakpoint) => {
                    const paramsDict = {
                        ...values.filterQueryParams,
                        person_uuid: props.personUUID ?? '',
                        limit: LIMIT,
                    }
                    const params = toParams(paramsDict)
                    await breakpoint(100) // Debounce for lots of quick filter changes

                    const startTime = performance.now()
                    const response = await api.get(`api/projects/${values.currentTeamId}/session_recordings?${params}`)
                    const loadTimeMs = performance.now() - startTime

                    actions.reportRecordingsListFetched(loadTimeMs)

                    breakpoint()
                    return response
                },
            },
        ],
    }),
    events: ({ actions }) => ({
        afterMount: () => {
            actions.getSessionRecordings()
        },
    }),
    reducers: {
        filterEnabled: [
            false,
            {
                enableFilter: () => true,
            },
        ],
        sessionRecordings: [
            [] as SessionRecordingType[],
            {
                getSessionRecordingsSuccess: (_, { sessionRecordingsResponse }) => {
                    return [...sessionRecordingsResponse.results]
                },
                openSessionPlayer: (sessionRecordings, { sessionRecordingId }) => {
                    return [
                        ...sessionRecordings.map((sessionRecording) => {
                            if (sessionRecording.id === sessionRecordingId) {
                                return {
                                    ...sessionRecording,
                                    viewed: true,
                                }
                            } else {
                                return { ...sessionRecording }
                            }
                        }),
                    ]
                },
            },
        ],
        sessionRecordingId: [
            null as SessionRecordingId | null,
            {
                openSessionPlayer: (_, { sessionRecordingId }) => sessionRecordingId,
                closeSessionPlayer: () => null,
            },
        ],
        entityFilters: [
            DEFAULT_ENTITY_FILTERS as FilterType,
            {
                setEntityFilters: (_, { filters }) => ({ ...filters }),
            },
        ],
        propertyFilters: [
            DEFAULT_PROPERTY_FILTERS as AnyPropertyFilter[],
            {
                setPropertyFilters: (_, { filters }) => [...filters],
            },
        ],
        durationFilter: [
            DEFAULT_DURATION_FILTER as RecordingDurationFilter,
            {
                setDurationFilter: (_, { durationFilter }) => durationFilter,
            },
        ],
        offset: [
            0,
            {
                loadNext: (previousOffset) => previousOffset + LIMIT,
                loadPrev: (previousOffset) => Math.max(previousOffset - LIMIT),
                setOffset: (_, { offset }) => offset,
            },
        ],
        fromDate: [
            DEFAULT_FROM_DATE as null | string,
            {
                setDateRange: (_, { incomingFromDate }) => incomingFromDate ?? null,
            },
        ],
        toDate: [
            null as string | null,
            {
                setDateRange: (_, { incomingToDate }) => incomingToDate ?? null,
            },
        ],
    },
    listeners: ({ actions }) => ({
        setEntityFilters: () => {
            actions.getSessionRecordings()
        },
        setPropertyFilters: () => {
            actions.getSessionRecordings()
        },
        setDateRange: () => {
            actions.getSessionRecordings()
        },
        setDurationFilter: () => {
            actions.getSessionRecordings()
        },
        loadNext: () => {
            actions.getSessionRecordings()
        },
        loadPrev: () => {
            actions.getSessionRecordings()
        },
    }),
    selectors: {
        hasPrev: [(s) => [s.offset], (offset) => offset > 0],
        hasNext: [
            (s) => [s.sessionRecordingsResponse],
            (sessionRecordingsResponse) => sessionRecordingsResponse.has_next,
        ],
        showFilters: [
            (s) => [s.filterEnabled, s.entityFilters, s.propertyFilters, featureFlagLogic.selectors.featureFlags],
            (filterEnabled, entityFilters, propertyFilters, featureFlags) => {
                return (
                    featureFlags[FEATURE_FLAGS.RECORDINGS_FILTER_EXPERIMENT] === 'test' ||
                    filterEnabled ||
                    entityFilters !== DEFAULT_ENTITY_FILTERS ||
                    propertyFilters !== DEFAULT_PROPERTY_FILTERS
                )
            },
        ],
        filterQueryParams: [
            (s) => [s.entityFilters, s.fromDate, s.toDate, s.offset, s.durationFilter, s.propertyFilters],
            (entityFilters, fromDate, toDate, offset, durationFilter, propertyFilters) => {
                return {
                    actions: entityFilters.actions,
                    events: entityFilters.events,
                    properties: propertyFilters,
                    date_from: fromDate,
                    date_to: toDate,
                    offset: offset,
                    session_recording_duration: durationFilter,
                }
            },
        ],
    },
    actionToUrl: ({ values, props }) => {
        const buildURL = (
            replace: boolean,
            source?: RecordingWatchedSource
        ): [
            string,
            Record<string, any>,
            HashParams,
            {
                replace: boolean
            }
        ] => {
            const hashParams: HashParams = {
                ...router.values.hashParams,
            }

            if (props.disableFiltering || Object.keys(values.filterQueryParams).length === 0) {
                delete hashParams.recordingFilters
            } else {
                hashParams.recordingFilters = values.filterQueryParams
            }

            if (!values.sessionRecordingId) {
                delete hashParams.sessionRecordingId
            } else {
                hashParams.sessionRecordingId = values.sessionRecordingId
            }

            if (!source) {
                delete hashParams.source
            } else {
                hashParams.source = source
            }

            return [router.values.location.pathname, {}, hashParams, { replace }]
        }

        return {
            loadSessionRecordings: () => buildURL(true),
            openSessionPlayer: ({ source }) => buildURL(false, source),
            closeSessionPlayer: () => buildURL(false),
            setEntityFilters: () => buildURL(true),
            setPropertyFilters: () => buildURL(true),
            setDateRange: () => buildURL(true),
            setDurationFilter: () => buildURL(true),
            loadNext: () => buildURL(true),
            loadPrev: () => buildURL(true),
        }
    },

    urlToAction: ({ actions, values, props }) => {
        const urlToAction = (_: any, _params: any, hashParams: HashParams): void => {
            const nulledSessionRecordingId = hashParams.sessionRecordingId ?? null
            if (nulledSessionRecordingId !== values.sessionRecordingId) {
                actions.openSessionPlayer(nulledSessionRecordingId, RecordingWatchedSource.Direct)
            }

            const filters = hashParams.recordingFilters
            if (filters && !props.disableFiltering) {
                if (
                    !equal(filters.actions, values.entityFilters.actions) ||
                    !equal(filters.events, values.entityFilters.events)
                ) {
                    actions.setEntityFilters({
                        events: filters.events || [],
                        actions: filters.actions || [],
                    })
                }
                if (!equal(filters.properties, values.propertyFilters)) {
                    actions.setPropertyFilters(filters.properties ?? [])
                }
                if (filters.date_from !== values.fromDate || filters.date_to !== values.toDate) {
                    actions.setDateRange(filters.date_from ?? undefined, filters.date_to ?? undefined)
                }
                if (filters.offset !== values.offset) {
                    actions.setOffset(filters.offset ?? 0)
                }
                if (!equal(filters.session_recording_duration, values.durationFilter)) {
                    actions.setDurationFilter(filters.session_recording_duration ?? DEFAULT_DURATION_FILTER)
                }
            }
        }
        const urlPattern =
            props.tableLocation === RecordingTableLocation.PersonPage
                ? '/person/*'
                : props.tableLocation === RecordingTableLocation.HomePage
                ? '/home'
                : '/recordings'
        return {
            [urlPattern]: urlToAction,
        }
    },
})
