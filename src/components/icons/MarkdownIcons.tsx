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

export function IconStrikethrough(props: Props) {
  return (
    <Svg {...props} viewBox="0 0 24 24">
      <path d="M5 12h14v2H5v-2z" />
      <path d="M9.2 6.2c.7-.5 1.6-.8 2.8-.8 2.4 0 4 1.1 4 2.9 0 .6-.2 1.1-.5 1.5a1 1 0 1 1-1.6-1.2c.1-.2.1-.3.1-.4 0-.6-.9-1-2-1-1 0-1.7.2-2.1.5-.3.2-.4.4-.4.7 0 .7.9 1.2 2.7 1.7H9.2a6.5 6.5 0 0 1-1.7-.8C6.5 10.1 6 9.2 6 8.1c0-.8.3-1.5 1-1.9z" />
      <path d="M8.1 15.1a1 1 0 0 1 1.3.5c.4.8 1.5 1.4 2.8 1.4 1.1 0 1.9-.3 2.4-.8.3-.3.4-.6.4-.9 0-.7-.8-1.1-2.6-1.4h4.1c1.4.6 2.1 1.6 2.1 3 0 1-.4 1.9-1.2 2.6-.9.8-2.3 1.3-4.1 1.3-2.2 0-4.1-1-5-2.8a1 1 0 0 1 .4-1.3z" />
    </Svg>
  )
}

export function IconInlineCode(props: Props) {
  return (
    <Svg {...props} viewBox="0 0 24 24">
      <path d="M8.4 9.2a1 1 0 0 1 0 1.4L6.9 12l1.5 1.4a1 1 0 0 1-1.4 1.4l-2.2-2.1a1 1 0 0 1 0-1.4L7 9.2a1 1 0 0 1 1.4 0z" />
      <path d="M15.6 9.2a1 1 0 0 1 1.4 0l2.2 2.1a1 1 0 0 1 0 1.4L17 14.8a1 1 0 0 1-1.4-1.4l1.5-1.4-1.5-1.4a1 1 0 0 1 0-1.4z" />
      <path d="M10.2 17.5a1 1 0 0 1-.7-1.2l2.6-10.6a1 1 0 1 1 1.9.5l-2.6 10.6a1 1 0 0 1-1.2.7z" />
    </Svg>
  )
}

export function IconQuote(props: Props) {
  return (
    <Svg {...props} viewBox="0 0 24 24">
      <path d="M7.2 10.2c0-2.4 1.6-4.2 4-4.7v2c-1.2.4-2 1.4-2 2.7v.8h2v6h-6v-6.8z" />
      <path d="M15 10.2c0-2.4 1.6-4.2 4-4.7v2c-1.2.4-2 1.4-2 2.7v.8h2v6h-6v-6.8z" />
    </Svg>
  )
}

export function IconOrderedList(props: Props) {
  return (
    <Svg {...props} viewBox="0 0 24 24">
      <path d="M3.6 6.2h2.2V5H3V3.8h3.8V7H5.6V6.2h-2z" />
      <path d="M3 12.8c0-1.1.8-1.8 2.1-1.8 1.3 0 2.1.6 2.1 1.6 0 .7-.3 1.1-1.2 1.8L4.9 15h2.3v1.2H3v-1.1l2.2-2.1c.5-.5.6-.7.6-.9 0-.3-.2-.5-.6-.5-.4 0-.6.2-.6.7H3z" />
      <path d="M8 6h14v2H8V6zm0 6h14v2H8v-2zm0 6h14v2H8v-2z" />
    </Svg>
  )
}

export function IconImage(props: Props) {
  return (
    <Svg {...props} viewBox="0 0 24 24">
      <path d="M6 5h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zm0 2v10h12V7H6z" />
      <path d="M8.5 10.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z" />
      <path d="M7 16l3.2-3.5 2.3 2.6 1.6-1.8L17 16H7z" />
    </Svg>
  )
}

export function IconTable(props: Props) {
  return (
    <Svg {...props} viewBox="0 0 24 24">
      <path d="M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zm0 4v3h6V9H5zm8 0v3h6V9h-6zM5 14v3h6v-3H5zm8 0v3h6v-3h-6z" />
    </Svg>
  )
}

export function IconHr(props: Props) {
  return (
    <Svg {...props} viewBox="0 0 24 24">
      <path d="M4 11h16v2H4v-2z" />
      <path d="M7 7h2v2H7V7zm8 0h2v2h-2V7zm-8 8h2v2H7v-2zm8 0h2v2h-2v-2z" />
    </Svg>
  )
}

export function IconHeading(props: Props) {
  return (
    <Svg {...props} viewBox="0 0 24 24">
      <path d="M5 6h2v5h6V6h2v12h-2v-5H7v5H5V6z" />
      <path d="M17 10h2v8h-2v-8zm0-4h2v2h-2V6z" />
    </Svg>
  )
}

export function IconTaskList(props: Props) {
  return (
    <Svg {...props} viewBox="0 0 24 24">
      <path d="M4 6h4v4H4V6zm2 1.5a.5.5 0 0 0-.5.5v0a.5.5 0 0 0 .5.5h0a.5.5 0 0 0 .5-.5v0a.5.5 0 0 0-.5-.5H6z" />
      <path d="M4 14h4v4H4v-4zm0-5h16v2H10V9zm0 8h16v2H10v-2z" />
    </Svg>
  )
}

