/* global $, DragDrop, duplicate, expandObject, game, ItemSheet, mergeObject */

import { COC7 } from '../../config.js'
import { CoC7Item } from '../item.js'
import { CoC7Utilities } from '../../utilities.js'
// import { CoCActor } from '../../actors/actor.js';

/**
 * Extend the basic ItemSheet with some very simple modifications
 */
export class CoC7OccupationSheet extends ItemSheet {
  /**
   * Activate event listeners using the prepared sheet HTML
   * @param html {HTML}   The prepared HTML object ready to be rendered into the DOM
   */
  activateListeners (html) {
    super.activateListeners(html)
    // Everything below here is only needed if the sheet is editable
    if (!this.options.editable) return

    html
      .find('.item .item-name h4')
      .click(event => this._onItemSummary(event, 'skills'))
    html
      .find('.item-delete')
      .click(event => this._onItemDelete(event, 'skills'))

    html.find('.group-item-delete').click(this._onGroupItemDelete.bind(this))
    html.find('.group-control').click(this._onGroupControl.bind(this))

    const dragDrop = new DragDrop({
      dropSelector: '.droppable',
      callbacks: { drop: this._onDrop.bind(this) }
    })
    dragDrop.bind(html[0])
  }

  async _onDrop (event, type = 'skill', collectionName = 'skills') {
    event.preventDefault()
    event.stopPropagation()

    const optionalSkill =
      event?.currentTarget?.classList?.contains('optional-skills')
    const ol = event?.currentTarget?.closest('ol')
    const index = ol?.dataset?.group

    const dataList = await CoC7Utilities.getDataFromDropEvent(event, 'Item')

    const collection = this.item.data.data[collectionName]
      ? duplicate(this.item.data.data[collectionName])
      : []
    const groups = this.item.data.data.groups
      ? duplicate(this.item.data.data.groups)
      : []

    for (const item of dataList) {
      if (!item || !item.data) continue
      if (![type].includes(item.data.type)) {
        continue
      }

      if (optionalSkill) {
        if (!CoC7Item.isAnySpec(item)) {
          // Generic specialization can be included many times
          if (collection.find(el => el.name === item.data.name)) {
            continue // If skill is already in main don't add it
          }
          if (groups[index].skills.find(el => el.name === item.name)) {
            continue // If skill is already in group don't add it
          }
        }

        groups[index].skills = groups[index].skills.concat([item.data])
      } else {
        if (!CoC7Item.isAnySpec(item)) {
          // Generic specialization can be included many times
          if (collection.find(el => el.name === item.data.name)) {
            continue
          }

          for (let i = 0; i < groups.length; i++) {
            // If the same skill is in one of the group remove it from the groups
            const index = groups[i].skills.findIndex(
              el => el.name === item.data.name
            )
            if (index !== -1) {
              groups[i].skills.splice(index, 1)
            }
          }
        }
        collection.push(duplicate(item.data))
      }
    }
    await this.item.update({ 'data.groups': groups })
    await this.item.update({ [`data.${collectionName}`]: collection })
  }

  async _onGroupControl (event) {
    event.preventDefault()
    const a = event.currentTarget

    // Add new damage component
    if (a.classList.contains('add-group')) {
      await this._onSubmit(event) // Submit any unsaved changes
      const groups = this.item.data.data.groups
      await this.item.update({
        'data.groups': groups.concat([{ options: 0, skills: [] }])
      })
    }

    if (a.classList.contains('remove-group')) {
      await this._onSubmit(event) // Submit any unsaved changes
      const groups = duplicate(this.item.data.data.groups)
      const ol = a.closest('.item-list.group')
      groups.splice(Number(ol.dataset.group), 1)
      await this.item.update({ 'data.groups': groups })
    }
  }

  _onItemSummary (event, collectionName = 'items') {
    event.preventDefault()
    const li = $(event.currentTarget).parents('.item')
    const item = this.item.data.data[collectionName].find(s => {
      return s._id === li.data('item-id')
    })
    const chatData = item.data.description

    // Toggle summary
    if (li.hasClass('expanded')) {
      const summary = li.children('.item-summary')
      summary.slideUp(200, () => summary.remove())
    } else {
      const div = $(`<div class="item-summary">${chatData.value}</div>`)
      const props = $('<div class="item-properties"></div>')
      // for (const p of chatData.properties) { props.append(`<span class="tag">${p}</span>`) }
      div.append(props)
      li.append(div.hide())
      div.slideDown(200)
    }
    li.toggleClass('expanded')
  }

  async _onItemDelete (event, collectionName = 'items') {
    const itemIndex = $(event.currentTarget).parents('.item').data('item-id')
    if (itemIndex) await this.removeItem(itemIndex, collectionName)
  }

  async _onGroupItemDelete (event) {
    const a = event.currentTarget
    const li = a.closest('.item')
    const ol = li.closest('.item-list.group')
    const groups = duplicate(this.item.data.data.groups)
    groups[Number(ol.dataset.group)].skills.splice(
      Number(li.dataset.itemIndex),
      1
    )
    await this.item.update({ 'data.groups': groups })
  }

  async removeItem (itemId, collectionName = 'items') {
    const itemIndex = this.item.data.data[collectionName].findIndex(s => {
      return s._id === itemId
    })
    if (itemIndex > -1) {
      const collection = this.item.data.data[collectionName]
        ? duplicate(this.item.data.data[collectionName])
        : []
      collection.splice(itemIndex, 1)
      await this.item.update({ [`data.${collectionName}`]: collection })
    }
  }

  static get defaultOptions () {
    return mergeObject(super.defaultOptions, {
      classes: ['coc7', 'sheet', 'occupation'],
      width: 520,
      height: 480,
      dragDrop: [{ dragSelector: '.item' }],
      scrollY: ['.tab.description'],
      tabs: [
        {
          navSelector: '.sheet-navigation',
          contentSelector: '.sheet-body',
          initial: 'description'
        }
      ]
    })
  }

  get template () {
    return 'systems/CoC7/templates/items/occupation.html'
  }

  _onDragStart (event) {
    const li = event.currentTarget.closest('.item')
    const skill = this.item.data.data.skills.find(s => {
      return s._id === li.dataset.itemId
    })

    const dragData = { type: 'Item', data: skill }
    event.dataTransfer.setData('text/plain', JSON.stringify(dragData))
  }

  getData () {
    const data = super.getData()

    /** MODIF: 0.8.x **/
    const itemData = data.data
    data.data = itemData.data // MODIF: 0.8.x data.data
    /*****************/

    data.isOwned = this.item.isOwned

    const optionnal = []
    const mandatory = []
    for (const [key, carac] of Object.entries(
      data.data.occupationSkillPoints
    )) {
      if (carac.multiplier) {
        const caracName = game.i18n.localize(`CHARAC.${key.toUpperCase()}`)
        if (carac.selected && carac.optional) {
          optionnal.push(`${caracName}x${carac.multiplier}`)
        }
        if (carac.selected && !carac.optional) {
          mandatory.push(`${caracName}x${carac.multiplier}`)
        }
      }
    }

    data.skillListEmpty = data.data.skills.length === 0
    for (const skill of data.data.skills) {
      // For each skill if it's a spec and spac name not included in the name add it
      if (
        skill.data.specialization &&
        !skill.name.includes(skill.data.specialization)
      ) {
        skill.displayName = `${skill.data.specialization} (${skill.name})`
      } else skill.displayName = skill.name
    }

    data.data.skills.sort((a, b) => {
      return a.displayName.localeCompare(b.displayName)
    })

    for (let index = 0; index < data.data.groups.length; index++) {
      data.data.groups[index].isEmpty =
        data.data.groups[index].skills.length === 0
      for (const skill of data.data.groups[index].skills) {
        // For each skill of each sub group if it's a spec and spac name not included in the name add it
        if (
          skill.data.specialization &&
          !skill.name.includes(skill.data.specialization)
        ) {
          skill.displayName = `${skill.data.specialization} (${skill.name})`
        } else skill.displayName = skill.name
      }

      data.data.groups[index].skills.sort((a, b) => {
        return a.displayName.localeCompare(b.displayName)
      })
    }

    data.occupationPointsString = ''
    const orString = ` ${game.i18n.localize('CoC7.Or')} `
    if (mandatory.length) data.occupationPointsString += mandatory.join(' + ')
    if (optionnal.length && mandatory.length) {
      data.occupationPointsString += ` + (${optionnal.join(orString)})`
    }
    if (optionnal.length && !mandatory.length) {
      data.occupationPointsString += optionnal.join(orString)
    }

    data.itemProperties = []

    for (const [key, value] of Object.entries(data.data.type)) {
      if (value) {
        data.itemProperties.push(
          COC7.occupationProperties[key] ? COC7.occupationProperties[key] : null
        )
      }
    }

    data.isKeeper = game.user.isGM
    return data
  }

  _updateObject (event, formData) {
    // TODO: This can be removed once 0.7.x is release channel
    if (!formData.data) formData = expandObject(formData)

    if (formData.data.groups) {
      formData.data.groups = Object.values(formData.data?.groups || {})
      for (let index = 0; index < this.item.data.data.groups.length; index++) {
        formData.data.groups[index].skills = duplicate(
          this.item.data.data.groups[index].skills
        )
      }
    }

    super._updateObject(event, formData)
  }
}
