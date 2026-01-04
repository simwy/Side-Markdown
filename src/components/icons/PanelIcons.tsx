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

// Panels / Layout icons (no extra deps)

export function IconToc(props: Props) {
  // "List + bullets"
  return (
    <Svg {...props} viewBox="0 0 24 24">
      <path d="M4 6.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm0 7a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm0 7a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zM8 5h14v2H8V5zm0 7h14v2H8v-2zm0 7h14v2H8v-2z" />
    </Svg>
  )
}

export function IconEditor(props: Props) {
  // Pencil on paper
  return (
    <Svg {...props} viewBox="0 0 24 24">
      <path d="M4 4h10a1 1 0 0 1 0 2H6v12h12v-8a1 1 0 1 1 2 0v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
      <path d="M20.7 3.3a1 1 0 0 1 0 1.4l-9.2 9.2-2.9.7a1 1 0 0 1-1.2-1.2l.7-2.9 9.2-9.2a1 1 0 0 1 1.4 0l2 2zm-3.4 1.4-7.8 7.8-.2.9.9-.2 7.8-7.8-.7-.7z" />
    </Svg>
  )
}

export function IconPreview(props: Props) {
  // Eye
  return (
    <Svg {...props} viewBox="0 0 24 24">
      <path d="M12 5c5.5 0 9.7 4.6 10.8 6a1.6 1.6 0 0 1 0 2c-1.1 1.4-5.3 6-10.8 6S2.3 14.4 1.2 13a1.6 1.6 0 0 1 0-2C2.3 9.6 6.5 5 12 5zm0 2c-4.3 0-7.8 3.6-9 5 1.2 1.4 4.7 5 9 5s7.8-3.6 9-5c-1.2-1.4-4.7-5-9-5z" />
      <path d="M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm0 2a1 1 0 1 0 0 2 1 1 0 0 0 0-2z" />
    </Svg>
  )
}


export function IconChevronLeft(props: Props) {
  // Material-like chevron left
  return (
    <Svg {...props} viewBox="0 0 24 24">
      <path d="M15.41 16.59 10.83 12l4.58-4.59L14 6l-6 6 6 6z" />
    </Svg>
  )
}

export function IconChevronRight(props: Props) {
  // Material-like chevron right
  return (
    <Svg {...props} viewBox="0 0 24 24">
      <path d="M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6z" />
    </Svg>
  )
}
