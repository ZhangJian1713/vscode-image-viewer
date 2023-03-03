import { useInViewport } from 'ahooks'
import { Image } from 'antd'
import React, { useRef } from 'react'
import styled from 'styled-components'

interface IImageLazyLoadProps {
  enableLazyLoad: boolean
  src: string
  size: number
  backgroundColor: string
}

const StyleImagePlaceHolder = styled.div`
  display:  inline-block;
  border: solid 1px #ccc;
`

/**
 *
 * @param props
 * @returns
 */
const ImageLazyLoad: React.FC<IImageLazyLoadProps> = ({ enableLazyLoad, src, size, backgroundColor }) => {
  const ref = useRef(null)
  const [inViewport] = useInViewport(ref)
  if(enableLazyLoad && !inViewport){
    return <StyleImagePlaceHolder ref={ref} style={{width:size, height: size}} />
  }
  return <Image width={size} height={size} style={{ backgroundColor, objectFit: 'contain' }} src={src} />
}

export default ImageLazyLoad
