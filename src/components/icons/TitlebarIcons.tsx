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

// 说明：
// - 这些图标使用“Font Awesome 风格”的开源 SVG 形态（无需额外依赖，避免 npm 网络问题导致无法安装）。
// - 如你恢复 npm 网络，可随时替换为 @fortawesome/react-fontawesome 的官方组件。

export function IconAlignLeft(props: Props) {
  return (
    <Svg {...props} viewBox="0 0 448 512">
      <path d="M0 64c0-17.7 14.3-32 32-32H416c17.7 0 32 14.3 32 32s-14.3 32-32 32H32C14.3 96 0 81.7 0 64zm0 128c0-17.7 14.3-32 32-32H288c17.7 0 32 14.3 32 32s-14.3 32-32 32H32c-17.7 0-32-14.3-32-32zm0 128c0-17.7 14.3-32 32-32H416c17.7 0 32 14.3 32 32s-14.3 32-32 32H32c-17.7 0-32-14.3-32-32zm0 128c0-17.7 14.3-32 32-32H288c17.7 0 32 14.3 32 32s-14.3 32-32 32H32c-17.7 0-32-14.3-32-32z" />
    </Svg>
  )
}

export function IconAlignCenter(props: Props) {
  return (
    <Svg {...props} viewBox="0 0 448 512">
      <path d="M0 64c0-17.7 14.3-32 32-32H416c17.7 0 32 14.3 32 32s-14.3 32-32 32H32C14.3 96 0 81.7 0 64zm64 128c0-17.7 14.3-32 32-32H352c17.7 0 32 14.3 32 32s-14.3 32-32 32H96c-17.7 0-32-14.3-32-32zm-64 128c0-17.7 14.3-32 32-32H416c17.7 0 32 14.3 32 32s-14.3 32-32 32H32c-17.7 0-32-14.3-32-32zm64 128c0-17.7 14.3-32 32-32H352c17.7 0 32 14.3 32 32s-14.3 32-32 32H96c-17.7 0-32-14.3-32-32z" />
    </Svg>
  )
}

export function IconAlignRight(props: Props) {
  return (
    <Svg {...props} viewBox="0 0 448 512">
      <path d="M0 64c0-17.7 14.3-32 32-32H416c17.7 0 32 14.3 32 32s-14.3 32-32 32H32C14.3 96 0 81.7 0 64zm128 128c0-17.7 14.3-32 32-32H416c17.7 0 32 14.3 32 32s-14.3 32-32 32H160c-17.7 0-32-14.3-32-32zM0 320c0-17.7 14.3-32 32-32H416c17.7 0 32 14.3 32 32s-14.3 32-32 32H32c-17.7 0-32-14.3-32-32zm128 128c0-17.7 14.3-32 32-32H416c17.7 0 32 14.3 32 32s-14.3 32-32 32H160c-17.7 0-32-14.3-32-32z" />
    </Svg>
  )
}

