import clsx from 'clsx'

import { Lettermark } from '../Lettermark'

export interface UploadedLogoProps {
    name: string
    /**
     * When mediaId is not provided, a lettermark is used for the logo.
     * The optional entity ID determines which lettermark color is used.
     * If a string is provided, it will be treated as a UUID (the last 4 bytes will be used as the entity ID).
     */
    entityId: number | string
    mediaId?: string | null
    /** @default 'medium' */
    size?: 'xsmall' | 'medium' | 'xlarge'
}

export function UploadedLogo({ name, mediaId, entityId, size = 'medium' }: UploadedLogoProps): JSX.Element {
    if (!mediaId) {
        if (typeof entityId === 'string') {
            // A whole UUID doesn't fit into the JS number type, so for simplicity
            // just using the last 4 bytes of the UUID as the entity ID
            entityId = parseInt(entityId.split('-').at(-1)!, 16)
        }
        return <Lettermark index={entityId} name={name} size={size} />
    }

    return (
        <div
            className={clsx(
                'relative flex overflow-hidden select-none',
                size === 'xlarge'
                    ? 'size-16 rounded before:absolute before:inset-0 before:border before:rounded'
                    : size === 'medium'
                    ? 'size-6 rounded-sm'
                    : 'size-4 rounded-sm'
            )}
        >
            <img
                className="size-full object-cover"
                src={mediaId.startsWith('data:') ? mediaId : `/uploaded_media/${mediaId}`}
            />
        </div>
    )
}
