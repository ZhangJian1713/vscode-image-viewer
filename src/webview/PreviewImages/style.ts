import styled from 'styled-components'

export const StyledFolderOpenTwoTone = styled.span`
  visibility: hidden;
  margin-left: 12px;
  font-size: 16px;
  font-weight: 500;
`

export const StyledPreviewImages = styled.div`
  .ant-collapse > .ant-collapse-item > .ant-collapse-header{
    padding: 8px 12px;
  }
  .ant-collapse-content > .ant-collapse-content-box {
    padding: 12px 12px 0 12px;
  }
  .ant-collapse-header {
    :hover ${StyledFolderOpenTwoTone} {
      visibility: visible;
      :active {
        position: relative;
        top: 2px;
      }
    }
  }
  .ant-collapse-content-box {
    position: relative;
  }
  .ant-collapse > .ant-collapse-item > .ant-collapse-header {
    padding: 4px 12px;
  }
`

export const StyleTopRows = styled.div`
  margin: 0 0 10px 0;
`

export const StyleImageList = styled.div`
  display: flex;
  flex-wrap: wrap;
  width: 100%;
`

export const StyleImage = styled.div`
  border-radius: 2px;
  display: flex;
  flex-direction: column;
  justify-content: start;
  align-items: center;
  margin: 0 12px 12px 0;

  div .ant-image {
    position: relative;
    display: flex;
    align-items: center;
  }
`

export const StyleImageDirPath = styled.div`
  background-color: #d7e9f4;
  margin: 12px 0 2px 0;
  padding: 4px 8px;
`

interface IStyleSquareProps {
  isSelected: boolean
  color: string
}
export const StyleSquare = styled.span<IStyleSquareProps>`
  display: inline-block;
  width: 20px;
  height: 20px;
  height: ${(props) => props.isSelected ? '26px' : '20px'};
  width: ${(props) => props.isSelected ? '26px' : '20px'};
  border: 1px solid #ddd;
  background-color: ${(props) => props.color};
  position: relative;
  top: 5px;
  margin-right: 12px;
  cursor: pointer;
`

export const StyleRowTitle = styled.span`
  font-weight: 500;
  margin-right: 16px;
`

export const StyledPicCount = styled.span`
  color: #8bbacc;
  margin: 0 0 0 12px;
`

export const StyledImgsContainer = styled.div`
  height: calc(100vh - 228px);
  overflow-y: auto;
  border: 1px solid #eee;
  border-left: none;
  border-right: none;
`

export const StyledBetweenWrapper = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
`