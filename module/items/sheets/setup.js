/* global $, duplicate, expandObject, game, ItemSheet, mergeObject */

import { COC7 } from '../../config.js'
import { CoC7Item } from '../item.js'
import { CoC7Utilities } from '../../utilities.js'
// import { CoC7Item } from '../item.js';
// import { CoCActor } from '../../actors/actor.js';

/**
 * Extend the basic ItemSheet with some very simple modifications
 */
export class CoC7SetupSheet extends ItemSheet {
  /**
   * Activate event listeners using the prepared sheet HTML
   * @param html {HTML}   The prepared HTML object ready to be rendered into the DOM
   */
  activateListeners (html) {
    super.activateListeners(html)

    if (!this.options.editable) return

    html
      .find('.item .item-name h4')
      .click(event => this._onItemSummary(event, 'items'))
    html.find('.item-delete').click(event => this._onItemDelete(event, 'items'))
    html.find('.add-bio').click(async () => await this._onAddBio())
    html.find('.remove-section').click(this._onRemoveSection.bind(this))
    html.find('.toggle-switch').click(this._onClickToggle.bind(this))

    // html.find('.item-edit').click(async ev => {
    //   const li = $(ev.currentTarget).parents('.item');
    //   const itemData = this.getItem(li.data('itemId'), 'skills');
    //   delete itemData._id;
    //   delete itemData.folder;
    //   const item = new CoC7Item(itemData);
    //   await item.sheet.render(true); //marche pas !!
    // });
  }

  async _onClickToggle (event) {
    event.preventDefault()
    const propertyId =
      event.currentTarget.closest('.toggle-switch').dataset.property
    await this.item.toggleProperty(
      propertyId,
      event.metaKey ||
        event.ctrlKey ||
        event.keyCode === 91 ||
        event.keyCode === 224
    )
  }

  async _onDrop (event, collectionName = 'items') {
    event.preventDefault()
    event.stopPropagation()

    const dataList = await CoC7Utilities.getDataFromDropEvent(event, 'Item')

    const collection = this.item.data.data[collectionName]
      ? duplicate(this.item.data.data[collectionName])
      : []
    for (const item of dataList) {
      if (!item || !item.data) continue
      if (
        !['item', 'weapon', 'skill', 'book', 'spell'].includes(item.data.type)
      ) {
        continue
      }

      if (!CoC7Item.isAnySpec(item)) {
        if (collection.find(el => el.name === item.data.name)) {
          continue
        }
      }

      collection.push(duplicate(item.data))
    }
    await this.item.update({ [`data.${collectionName}`]: collection })
  }

  async _onRemoveSection (event) {
    const a = event.currentTarget
    const div = a.closest('.item')
    const bio = duplicate(this.item.data.data.bioSections)
    bio.splice(Number(div.dataset.index), 1)
    await this.item.update({ 'data.bioSections': bio })
  }

  async _onAddBio () {
    const bio = this.item.data.data.bioSections
      ? duplicate(this.item.data.data.bioSections)
      : []
    bio.push(null)
    await this.item.update({ 'data.bioSections': bio })
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

  getItem (itemId, collectionName = 'items') {
    return this.item.data.data[collectionName].find(s => {
      return s._id === itemId
    })
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
      classes: ['coc7', 'sheet', 'setup'],
      width: 520,
      height: 530,
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
    return 'systems/CoC7/templates/items/setup.html'
  }

  _onDragStart (event) {
    const li = event.currentTarget.closest('.item')
    const skill = this.item.data.data.items.find(s => {
      return s._id === li.dataset.itemId
    })

    const dragData = { type: 'Item', data: skill }
    event.dataTransfer.setData('text/plain', JSON.stringify(dragData))
  }

  getData () {
    const data = super.getData()

    data.isOwned = this.item.isOwned

    /** MODIF: 0.8.x **/
    const itemData = data.data
    data.data = itemData.data // MODIF: 0.8.x data.data
    /*****************/

    // data.data.items = duplicate( data.data.skills);
    // this.item.update( { ['data.items'] : duplicate( data.data.skills)});

    data.skills = data.data.items.filter(it => it.type === 'skill')
    data.otherItems = data.data.items.filter(it => it.type !== 'skill')

    data.skillListEmpty = data.skills.length === 0
    data.itemsListEmpty = data.otherItems.length === 0
    for (const skill of data.skills) {
      if (
        skill.data.specialization &&
        !skill.name.includes(skill.data.specialization)
      ) {
        skill.displayName = `${skill.data.specialization} (${skill.name})`
      } else skill.displayName = skill.name
    }

    data.skills.sort((a, b) => {
      return a.displayName.localeCompare(b.displayName)
    })

    data.eras = {}
    data.itemProperties = []

    data._eras = []
    for (const [key, value] of Object.entries(COC7.eras)) {
      const era = {}
      era.id = key
      era.name = value
      era.isEnabled = this.item.data.data.eras[key] === true
      data._eras.push(era)
    }

    data.oneBlockBackStory = game.settings.get('CoC7', 'oneBlockBackstory')

    data.isKeeper = game.user.isGM
    return data
  }

  _updateObject (event, formData) {
    // TODO: This can be removed once 0.7.x is release channel
    if (!formData.data) formData = expandObject(formData)

    if (formData.data.bioSections) {
      formData.data.bioSections = Object.values(
        formData.data?.bioSections || []
      )
      // for(let index = 0; index < this.item.data.data.bioSections.length; index++) {
      //   formData.data.bioSections[index] = duplicate(this.item.data.data.bioSections[index]);
      // }
    }

    if (event.currentTarget?.name === 'data.characteristics.points.enabled') {
      formData.data.characteristics.rolls.enabled = !event.currentTarget.checked
    }

    if (event.currentTarget?.name === 'data.characteristics.rolls.enabled') {
      formData.data.characteristics.points.enabled =
        !event.currentTarget.checked
    }

    super._updateObject(event, formData)
  }
}
