import {
  Button,
  Checkbox,
  Collapse,
  ConfigProvider,
  Empty,
  Image,
  Input,
  Skeleton,
  Slider,
  Space,
  Spin,
  Tooltip
} from 'antd'
import { FolderOpenTwoTone, InfoCircleOutlined, SearchOutlined } from '@ant-design/icons'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { MESSAGE_CMD } from '../../constants'
import { callVscode } from '@easy_vscode/webview'
import mockData from './data'
import ImageLazyLoad from './ImageLazyLoad'
import {
  StyledBetweenWrapper,
  StyledFolderOpenTwoTone,
  StyledImgsContainer,
  StyledPicCount,
  StyledPreviewImages,
  StyleImage,
  StyleImageList,
  StyleRowTitle,
  StyleSquare,
  StyleTopRows
} from './style'
import ImageInfo from './ImageInfo'
import { useDebounceFn, useScroll } from 'ahooks'

const { Search } = Input
const mockImgs = [...mockData]

const completeImgs = (imgs, projectPath) => {
  return imgs.map((img) => {
    const filePath = img.path
    const dirPath = filePath.substring(0, filePath.lastIndexOf('/') + 1)
    const fileName = filePath.substring(filePath.lastIndexOf('/') + 1)
    const fileType = filePath.substring(filePath.lastIndexOf('.') + 1)
    const newImg = {
      ...img,
      fullPath: projectPath + '/' + img.path,
      dirPath,
      fileName,
      fileType
    }
    return newImg
  })
}

const backgroundColorOptions = [
  '#ffffff',
  '#cccccc',
  '#999999',
  '#333333',
  '#a89a89',
  '#a9e4af',
  '#f1a8a4',
  '#64bbe2',
  '#8488b6'
]

const LIMIT_OF_TOO_MANY = 120
const DEFAULT_IMAGE_SIZE = 100
const THRESHOLD_LAZY_LOADING = 100
const THRESHOLD_DELAY_CHANGE_SIZE = 200

export interface IImage {
  // origin properties
  path: string
  fullPath: string
  vscodePath: string
  size: number
  // extend properties
  fileName: string
  fileType: string
  dirPath: string
}

const PreviewImages: React.FC = () => {
  const [imgs, setImgs] = useState<IImage[]>([])
  const [allImageTypes, setAllImageTypes] = useState<string[]>([])
  const [showImageTypes, setShowImageTypes] = useState<string[]>([])
  const [activeKey, setActiveKey] = useState<string[]>([])
  const [allPaths, setAllPaths] = useState<string[]>([])
  const [showImgs, setShowImgs] = useState<IImage[]>([])
  const [backgroundColor, setBackgroundColor] = useState<string>(backgroundColorOptions[1])
  const [keyword, setKeyword] = useState<string>('')
  const [beforeFetch, setBeforeFetch] = useState(true)
  const [loading, setLoading] = useState(false)
  const [size, setSize] = useState<number>(DEFAULT_IMAGE_SIZE)
  const [isScrolling, setIsScrolling] = useState(false)

  const { run: onDebounceScroll } = useDebounceFn(
    () => {
      setIsScrolling(false)
    },
    {
      wait: 300
    }
  )
  const ref = useRef(null)
  const scroll = useScroll(ref)

  useEffect(() => {
    if (!isScrolling) {
      setIsScrolling(true)
    }
    onDebounceScroll(scroll)
  }, [scroll])

  const refreshImgs = () => {
    setLoading(true)
    callVscode({ cmd: MESSAGE_CMD.GET_ALL_IMGS }, ({ imgs, projectPath }) => {
      const { commandArgs } = window as any
      if (commandArgs?.[0]?.path) {
        setKeyword(commandArgs?.[0]?.path?.replace(projectPath + '/', ''))
      }
      setLoading(false)
      setBeforeFetch(false)
      updateImgs(imgs, projectPath)
    })
  }
  useEffect(refreshImgs, [])

  const updateImgs = (newImgs, projectPath) => {
    const imgs = completeImgs(newImgs, projectPath)
    setImgs(imgs)
    let allFileTypes: string[] = imgs.map((img) => img.fileType)
    allFileTypes = Array.from(new Set(allFileTypes)).sort()
    setAllImageTypes([...allFileTypes])
    setShowImageTypes([...allFileTypes])
  }

  useEffect(() => {
    const showImgs = imgs
      .filter((img) => img.path.indexOf(keyword) > -1)
      .filter((img) => showImageTypes.includes(img.fileType))
    setShowImgs(showImgs)
    let arr: string[] = showImgs.map((img) => img.dirPath)
    arr = Array.from(new Set(arr)).sort()
    setAllPaths(arr)
    const isVeryMany = showImgs.length > LIMIT_OF_TOO_MANY
    setActiveKey(isVeryMany ? [] : [...arr])
  }, [imgs, keyword, showImageTypes])

  const onDeleteImage = (filePath) => {
    const index = imgs.findIndex((img) => img.fullPath === filePath)
    if (index > -1) {
      imgs.splice(index, 1)
      setImgs([...imgs])
    }
  }

  const handleClickOpenFolder = (e, path: string) => {
    e.stopPropagation()
    callVscode({
      cmd: MESSAGE_CMD.OPEN_IMAGE_DIRECTORY,
      data: { path }
    })
  }

  const typeOptions = useMemo(() => {
    return allImageTypes.map((type) => ({
      label: (
        <span>
          {type}
          <StyledPicCount style={{ marginLeft: '4px' }}>
            ({imgs.filter((img) => img.fileType === type).length})
          </StyledPicCount>
        </span>
      ),
      value: type
    }))
  }, [allImageTypes, imgs])

  const handleChangeActiveKey = (value) => {
    setActiveKey([].concat(value))
  }

  const customizeRenderEmpty = () => {
    if (beforeFetch) {
      return <Skeleton active />
    }
    return (
      <div style={{ textAlign: 'center' }}>
        <Empty description='No images found' />
      </div>
    )
  }

  const handlerChangeImageSize = (value) => {
    if (imgs.length < THRESHOLD_DELAY_CHANGE_SIZE) {
      setSize(value)
    }
  }
  const handlerAfterChangeImageSize = (value) => {
    if (imgs.length >= THRESHOLD_DELAY_CHANGE_SIZE) {
      setSize(value)
    }
  }

  const enableLazyLoad = useMemo(() => {
    return imgs.length > THRESHOLD_LAZY_LOADING
  }, [imgs])
  return (
    <ConfigProvider renderEmpty={customizeRenderEmpty}>
      <Spin spinning={loading}>
        <StyledPreviewImages style={{ padding: '20px' }}>
          {/* Search */}
          <StyleTopRows>
            <Input
              addonBefore={<SearchOutlined />}
              allowClear
              size='middle'
              placeholder='image path/name'
              style={{ width: '100%', marginRight: '16px' }}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
            {/* <Button size='middle' onClick={refreshImgs}> Refresh </Button> */}
          </StyleTopRows>
          {/* Type */}
          <StyleTopRows style={{ marginBottom: '2px' }}>
            <StyledBetweenWrapper>
              <span>
                <StyleRowTitle>Type:</StyleRowTitle>
                <Checkbox.Group
                  options={typeOptions}
                  value={[...showImageTypes]}
                  onChange={(values) => setShowImageTypes(values as string[])}
                />
              </span>
              <span>
                Total count:<StyledPicCount style={{ marginLeft: '6px' }}>{imgs.length}</StyledPicCount>
              </span>
            </StyledBetweenWrapper>
          </StyleTopRows>
          {/* Background */}
          <StyleTopRows style={{ marginBottom: '6px' }}>
            <StyleRowTitle>Background:</StyleRowTitle>
            <span>
              {backgroundColorOptions.map((color) => (
                <StyleSquare
                  onClick={() => setBackgroundColor(color)}
                  isSelected={backgroundColor === color}
                  color={color}
                ></StyleSquare>
              ))}
            </span>
          </StyleTopRows>
          {/* Size */}
          <StyleTopRows style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
            <StyleRowTitle>Size:</StyleRowTitle>
            <Slider
              style={{ flex: 1 }}
              min={10}
              max={600}
              step={5}
              defaultValue={size}
              onChange={handlerChangeImageSize}
              onAfterChange={handlerAfterChangeImageSize}
            />
          </StyleTopRows>
          {/* Expand/Collapse All */}
          <StyleTopRows>
            <Space>
              <span style={{ color: '#bbb' }}>
                Filtered count: <span style={{ color: '#333' }}>{showImgs.length}</span>
              </span>
              <Tooltip
                placement='right'
                title={`When there are more than ${LIMIT_OF_TOO_MANY} images(after being filtered) being displayed, all directories are collapsed by default.`}
              >
                <InfoCircleOutlined style={{ fontSize: '16px', color: '#ccc' }} />
              </Tooltip>
              <Button onClick={() => setActiveKey([...allPaths])}>Expand All</Button>
              <Button onClick={() => setActiveKey([])}>Collapse All</Button>
            </Space>
          </StyleTopRows>
          <div>
            {allPaths.length === 0 ? (
              customizeRenderEmpty()
            ) : (
              <StyledImgsContainer ref={ref}>
                <Collapse activeKey={activeKey} onChange={handleChangeActiveKey}>
                  {allPaths.map((path) => (
                    <Collapse.Panel
                      header={
                        <span>
                          {path}
                          <StyledPicCount>({showImgs.filter((img) => img.dirPath === path).length})</StyledPicCount>
                          <StyledFolderOpenTwoTone>
                            <FolderOpenTwoTone twoToneColor='#f4d057' onClick={(e) => handleClickOpenFolder(e, path)} />
                          </StyledFolderOpenTwoTone>
                        </span>
                      }
                      key={path}
                    >
                      <StyleImageList>
                        <Image.PreviewGroup>
                          {showImgs
                            .filter((img) => img.dirPath === path)
                            .map((img) => (
                              <StyleImage key={img.path}>
                                <ImageLazyLoad
                                  isScrolling={isScrolling}
                                  enableLazyLoad={enableLazyLoad}
                                  img={img}
                                  size={size}
                                  backgroundColor={backgroundColor}
                                />
                                <ImageInfo size={size} img={img} onDeleteImage={onDeleteImage} />
                              </StyleImage>
                            ))}
                        </Image.PreviewGroup>
                      </StyleImageList>
                    </Collapse.Panel>
                  ))}
                </Collapse>
              </StyledImgsContainer>
            )}
          </div>
        </StyledPreviewImages>
      </Spin>
    </ConfigProvider>
  )
}

export default PreviewImages
