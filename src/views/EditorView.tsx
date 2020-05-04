import React, { useState, useEffect } from 'react'
// Header Components
import HeaderContainer from '~/components/header/HeaderContainer'
import HeaderLeft from '~/components/header/HeaderLeft'
import HeaderRight from '~/components/header/HeaderRight'
import HeaderTitle from '~/components/header/HeaderTitle'
// Header Buttons
import SaveButton from '~/components/buttons/SaveButton'
import BackButton from '~/components/buttons/BackButton'
// Editor Form Components
import {
  ContentContainer,
  Section,
  TagsContainer,
} from '~/components/editor/Form'
import Label from '~/components/editor/Label'
import Tag from '~/components/editor/Tag'
import TextArea from '~/components/editor/TextArea'
import Input from '~/components/editor/Input'
import { Dropdown, DropdownItem } from '~/components/editor/Dropdown'
import { FlexRow } from '~/components/common/FlexContainer'
import { useSelector } from 'react-redux'
import { getTags } from '~/store/modules/bookmarks'
import { generateBookmarkGuid, isBlank } from '~/helpers'
import { getEditingBookmark } from '~/store/modules/editing'
import { getActiveTab } from '~/browser/getTabInfo'
import CreateButton from '~/components/buttons/CreateButton'
import remove from 'lodash/fp/remove'

export type EditorViewProps = {
  onCreate: () => void
  onCancel: () => void
}

type TagsDropdownProps = {
  tags: string[]
  existingTags: string[]
  onAdd: (tag: string) => void
  onRemove: (tag: string) => void
}

const TagsDropdown = ({
  tags,
  existingTags,
  onAdd,
  onRemove,
}: TagsDropdownProps) => {
  const [currentTag, setCurrentTag] = useState('')
  return (
    <>
      <Label>Bookmark Tags</Label>
      <FlexRow>
        {existingTags.length > 0 && (
          <Dropdown>
            {existingTags.map((tag: string, index: number) => {
              return (
                <DropdownItem
                  key={index}
                  value={tag}
                  onClick={() => onAdd(tag)}
                >
                  {tag}
                </DropdownItem>
              )
            })}
          </Dropdown>
        )}
        <Input
          style={{ marginLeft: '0.25em' }}
          placeholder="Enter new Tag"
          value={currentTag}
          onChange={(e) => setCurrentTag(e.target.value)}
        />
        <CreateButton fill="#ccc" onClick={() => onAdd(currentTag)} />
      </FlexRow>
      {tags.length > 0 && (
        <TagsContainer>
          {tags.map((tag: string, index: number) => {
            return (
              <Tag key={index} onDelete={() => onRemove(tag)}>
                {tag}
              </Tag>
            )
          })}
        </TagsContainer>
      )}
    </>
  )
}

const Header = (props: EditorViewProps) => (
  <HeaderContainer>
    <HeaderLeft>
      <BackButton onClick={props.onCancel} />
      <HeaderTitle>Create Bookmark</HeaderTitle>
    </HeaderLeft>
    <HeaderRight>
      <SaveButton onClick={props.onCreate} />
    </HeaderRight>
  </HeaderContainer>
)

const View = (props: EditorViewProps) => {
  const existingTags = useSelector(getTags)
  const freshGuid = generateBookmarkGuid()
  const editingBookmark = useSelector(getEditingBookmark)

  const [guid] = useState<string>(editingBookmark?.guid || freshGuid)
  const [name, setName] = useState<string>(editingBookmark?.name || '')
  const [href, setHref] = useState<string>(editingBookmark?.href || '')
  const [desc, setDesc] = useState<string>(editingBookmark?.desc || '')
  const [currentTag, setCurrentTag] = useState<string>('')
  const [tags, setTags] = useState<string[]>(editingBookmark?.tags || [])

  useEffect(() => {
    if (!editingBookmark) {
      getActiveTab((tab) => {
        setName(tab.title)
        setHref(tab.url)
      })
    }
  }, [])

  useEffect(() => {
    setCurrentTag('')
  }, [tags])

  const handleRemoveTag = (tag: string) =>
    setTags(remove((item) => item === tag, tags))

  const handleAddTag = (tag: string) => !isBlank(tag) && setTags([...tags, tag])

  return (
    <>
      <Header onCreate={props.onCreate} onCancel={props.onCancel} />
      <ContentContainer>
        <Section>
          <Label>Bookmark Name</Label>
          <Input placeholder="Awesome cats on the internet" />
        </Section>
        <Section>
          <Label>Bookmark URL</Label>
          <Input placeholder="https://awesome.cats" />
        </Section>
        <Section>
          <Label>Bookmark Description</Label>
          <TextArea placeholder="Check out these awesome cats" />
        </Section>
        <TagsDropdown
          existingTags={existingTags}
          tags={tags}
          onAdd={handleAddTag}
          onRemove={handleRemoveTag}
        />
      </ContentContainer>
    </>
  )
}

export default View
