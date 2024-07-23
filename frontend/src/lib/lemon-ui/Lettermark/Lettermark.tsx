import './Lettermark.scss'

import clsx from 'clsx'
import React from 'react'

// This is the number of known --lettermark-* variables in `globals.scss`
const NUM_LETTERMARK_STYLES = 8

export enum LettermarkColor {
    Gray = 'gray',
}

export interface LettermarkProps {
    /** Name or value the lettermark should represent. */
    name?: string | number | null
    /** If given, will choose a color based on the index */
    index?: number
    /** Specify the color */
    color?: LettermarkColor
    /** Circular rounded style rather than square */
    rounded?: boolean
    /** @default 'medium' */
    size?: 'xsmall' | 'medium' | 'xlarge'
}

/** An icon-sized lettermark.
 *
 * When given a string, the initial letter is shown. Numbers up to 99 are displayed in full, in integer form.
 */
export const Lettermark = React.forwardRef<HTMLDivElement, LettermarkProps>(function Lettermark(
    { name, index, color, rounded = false, size = 'medium' },
    ref
) {
    const representation = name
        ? typeof name === 'number'
            ? String(Math.floor(name))
            : name.toLocaleUpperCase().charAt(0)
        : '?'

    const colorIndex = color ? color : typeof index === 'number' ? (index % NUM_LETTERMARK_STYLES) + 1 : undefined

    return (
        <div
            className={clsx(
                `Lettermark Lettermark--${size}`,
                colorIndex && `Lettermark--variant-${colorIndex}`,
                rounded && 'Lettermark--rounded',
                representation === '?' && 'Lettermark--unknown'
            )}
            title={String(name)}
            ref={ref}
        >
            {representation}
        </div>
    )
})
