import { EyeOutlined } from '@ant-design/icons'
import { callVscode } from '@easy_vscode/webview'
import { useInViewport } from 'ahooks'
import { Image } from 'antd'
import React, { useEffect, useRef, useState } from 'react'
import styled from 'styled-components'
import { IImage } from '..'
import { MESSAGE_CMD } from '../../../constants'

interface IImageLazyLoadProps {
  isScrolling: boolean
  enableLazyLoad: boolean
  img: IImage
  size: number
  backgroundColor: string
}

const StyleImagePlaceHolder = styled.div`
  display: inline-block;
  border: solid 1px #ccc;
`

const MIN_SIZE_SHOW_PREVIEW_INFO = 60

interface IDimensions {
  width: number
  height: number
}

/**
 *
 * @param props
 * @returns
 */
const ImageLazyLoad: React.FC<IImageLazyLoadProps> = ({ isScrolling, enableLazyLoad, img, size, backgroundColor }) => {
  const ref = useRef(null)
  const [inViewport] = useInViewport(ref)
  const [isShow, setIsShow] = useState(!enableLazyLoad || inViewport)
  const [dimensions, setDimensions] = useState<IDimensions>()

  useEffect(() => {
    if (!isScrolling) {
      setIsShow(!enableLazyLoad || inViewport)
    }
  }, [isScrolling, enableLazyLoad, inViewport])

  const handleMouseOver = () => {
    if (!dimensions) {
      callVscode({ cmd: MESSAGE_CMD.GET_IMAGE_SIZE, data: { filePath: img.fullPath } }, (dimensions) => {
        setDimensions(dimensions)
      })
    }
  }

  if (!isShow) {
    return <StyleImagePlaceHolder ref={ref} style={{ width: size, height: size }} />
  }
  return (
    <Image
      width={size}
      height={size}
      style={{ backgroundColor, objectFit: 'contain' }}
      src={img.vscodePath}
      preview={{
        mask: (
          <div className='ant-image-mask-info' onMouseOver={handleMouseOver}>
            <EyeOutlined />
            {size >= MIN_SIZE_SHOW_PREVIEW_INFO && (
              <>
                Preview
                {dimensions && (
                  <div style={{ fontSize: '12px' }}>
                    {dimensions.width} x {dimensions.height}
                  </div>
                )}
                <div style={{ fontSize: '12px' }}>{formatBytes(img.size)}</div>
              </>
            )}
          </div>
        )
      }}
    />
  )
}

export default ImageLazyLoad

function formatBytes(bytes: number, decimals: number = 1): string {
  if (bytes === 0) {
    return '0 Bytes'
  }
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}
