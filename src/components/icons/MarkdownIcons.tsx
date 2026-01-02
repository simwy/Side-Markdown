import React from 'react'

type Props = {
  size?: number
  className?: string
}

function Svg(props: Props & { children: React.ReactNode; viewBox: string }) {
  const size = props.size ?? 16
  return (
    <svg
      width={size}
      height={size}
      viewBox={props.viewBox}
      fill="currentColor"
      aria-hidden="true"
      className={props.className}
    >
      {props.children}
    </svg>
  )
}

export function IconBold(props: Props) {
  // Simple bold "B" shape
  return (
    <Svg {...props} viewBox="0 0 24 24">
      <path d="M7 4h6.2c2.5 0 4.3 1.6 4.3 3.9 0 1.5-.8 2.8-2.1 3.4 1.7.6 2.8 2.1 2.8 4 0 2.7-2 4.7-5.1 4.7H7V4zm6 6.8c1.4 0 2.3-.7 2.3-1.8S14.4 7.2 13 7.2H10v3.6h3zm.6 8c1.6 0 2.6-.9 2.6-2.2 0-1.3-1-2.2-2.6-2.2H10v4.4h3.6z" />
    </Svg>
  )
}

export function IconItalic(props: Props) {
  return (
    <Svg {...props} viewBox="0 0 24 24">
      <path d="M10 4h10v3h-4l-4 10h4v3H6v-3h4l4-10h-4V4z" />
    </Svg>
  )
}

export function IconList(props: Props) {
  return (
    <Svg {...props} viewBox="0 0 24 24">
      <path d="M4 6.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm0 7a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm0 7a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zM8 5h14v2H8V5zm0 7h14v2H8v-2zm0 7h14v2H8v-2z" />
    </Svg>
  )
}

export function IconLink(props: Props) {
  return (
    <Svg {...props} viewBox="0 0 24 24">
      <path d="M10.6 13.4a1 1 0 0 1 0-1.4l2.4-2.4a1 1 0 1 1 1.4 1.4l-2.4 2.4a1 1 0 0 1-1.4 0z" />
      <path d="M8.2 15.8l-1.6 1.6a3.4 3.4 0 0 1-4.8-4.8l1.6-1.6a3.4 3.4 0 0 1 5.6 1.1 1 1 0 1 1-1.9.6 1.4 1.4 0 0 0-2.3-.5L3.2 14a1.4 1.4 0 1 0 2 2l1.6-1.6a1 1 0 1 1 1.4 1.4z" />
      <path d="M15.8 8.2l1.6-1.6a3.4 3.4 0 0 1 4.8 4.8l-1.6 1.6a3.4 3.4 0 0 1-5.6-1.1 1 1 0 1 1 1.9-.6 1.4 1.4 0 0 0 2.3.5l1.6-1.6a1.4 1.4 0 1 0-2-2l-1.6 1.6a1 1 0 1 1-1.4-1.4z" />
    </Svg>
  )
}

export function IconCodeBlock(props: Props) {
  return (
    <Svg {...props} viewBox="0 0 24 24">
      <path d="M9.4 16.6a1 1 0 0 1-1.4 0L4.4 13a1.4 1.4 0 0 1 0-2l3.6-3.6a1 1 0 1 1 1.4 1.4L6.2 12l3.2 3.2a1 1 0 0 1 0 1.4z" />
      <path d="M14.6 16.6a1 1 0 0 1 0-1.4l3.2-3.2-3.2-3.2a1 1 0 1 1 1.4-1.4l3.6 3.6a1.4 1.4 0 0 1 0 2l-3.6 3.6a1 1 0 0 1-1.4 0z" />
      <path d="M12.8 5.2a1 1 0 0 1 .8 1.2l-2.2 12a1 1 0 1 1-2-.4l2.2-12a1 1 0 0 1 1.2-.8z" />
    </Svg>
  )
}

