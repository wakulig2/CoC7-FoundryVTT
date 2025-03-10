/* global CONFIG, Dialog, expandObject, foundry, game, isNewerVersion, mergeObject */
export class Updater {
  static async checkForUpdate () {
    this.systemUpdateVersion = String(
      game.settings.get('CoC7', 'systemUpdateVersion')
    )
    const runMigrate = isNewerVersion(
      game.system.data.version,
      this.systemUpdateVersion
    )
    this.updatedModules =
      game.settings.get('CoC7', 'systemUpdatedModuleVersion') || {}
    this.currentModules = {}
    for (const pack of game.packs) {
      if (
        !['CoC7', 'world'].includes(pack.metadata.package) &&
        ['Actor', 'Item'].includes(pack.metadata.entity)
      ) {
        if (
          !Object.prototype.hasOwnProperty.call(
            this.currentModules,
            pack.metadata.package
          )
        ) {
          // Only check each package once
          if (
            !Object.prototype.hasOwnProperty.call(
              this.updatedModules,
              pack.metadata.package
            ) ||
            String(this.updatedModules[pack.metadata.package]) !==
              String(game.modules.get(pack.metadata.package).data.version)
          ) {
            // Package has not been updated before or the version number has changed
            this.currentModules[pack.metadata.package] = game.modules.get(
              pack.metadata.package
            ).data.version
          }
        }
      }
    }
    if (runMigrate || Object.keys(this.currentModules).length > 0) {
      if (game.user.isGM) {
        new Dialog({
          title: game.i18n.localize('CoC7.Migrate.Title'),
          content: game.i18n.format(
            Object.keys(this.currentModules).length === 0
              ? 'CoC7.Migrate.Message'
              : 'CoC7.Migrate.WithModulesMessage',
            {
              version: game.system.data.version,
              modules:
                '<ul><li>' +
                Object.keys(this.currentModules)
                  .map(mod => game.modules.get(mod).data.name)
                  .join('</li><li>') +
                '</li></ul>'
            }
          ),
          buttons: {
            update: {
              label: game.i18n.localize('CoC7.Migrate.ButtonUpdate'),
              callback: async () => Updater.update()
            },
            skip: {
              label: game.i18n.localize('CoC7.Migrate.ButtonSkip')
            }
          }
        }).render(true)
      } else {
        new Dialog({
          title: game.i18n.localize('CoC7.Migrate.Title'),
          content: game.i18n.format('CoC7.Migrate.GMRequired', {
            version: game.system.data.version
          }),
          buttons: {
            OK: {
              label: game.i18n.localize('CoC7.Migrate.ButtonOkay')
            }
          }
        }).render(true)
      }
    }
  }

  static async update () {
    // Migrate World Actors
    for (const actor of game.actors.contents) {
      try {
        const updateData = this.migrateActorData(actor.toObject())
        if (!foundry.utils.isObjectEmpty(updateData)) {
          console.log(`Migrating Actor entity ${actor.name}`)
          await actor.update(updateData, { enforceTypes: false })
        }
      } catch (err) {
        err.message = `Failed CoC7 system migration for Actor ${actor.name}: ${err.message}`
        console.error(err)
      }
    }

    // Migrate World Items
    for (const item of game.items.contents) {
      try {
        const updateData = Updater.migrateItemData(item.toObject())
        if (!foundry.utils.isObjectEmpty(updateData)) {
          console.log(`Migrating Item entity ${item.name}`)
          await item.update(updateData, { enforceTypes: false })
        }
      } catch (err) {
        err.message = `Failed CoC7 system migration for Item ${item.name}: ${err.message}`
        console.error(err)
      }
    }

    // Migrate World Tables
    for (const table of game.tables.contents) {
      try {
        const updateData = Updater.migrateTableData(table.toObject())
        if (!foundry.utils.isObjectEmpty(updateData)) {
          console.log(`Migrating Table entity ${table.name}`)
          await table.update(updateData, { enforceTypes: false })
        }
      } catch (err) {
        err.message = `Failed CoC7 system migration for Table ${table.name}: ${err.message}`
        console.error(err)
      }
    }

    // Migrate Macros
    for (const macro of game.macros.contents) {
      try {
        const updateData = Updater.migrateMacroData(macro.toObject())
        if (!foundry.utils.isObjectEmpty(updateData)) {
          console.log(`Migrating Macro entity ${macro.name}`)
          await macro.update(updateData, { enforceTypes: false })
        }
      } catch (err) {
        err.message = `Failed CoC7 system migration for Table ${macro.name}: ${err.message}`
        console.error(err)
      }
    }

    // Migrate World Compendium Packs
    for (const pack of game.packs) {
      if (
        pack.metadata.package !== 'CoC7' &&
        ['Actor', 'Item', 'Macro', 'RollTable'].includes(pack.metadata.entity)
      ) {
        await Updater.migrateCompendiumData(pack)
      }
    }

    // Migrate Settings if Pulp Rules is enabled turn on all rules
    if (game.settings.get('CoC7', 'pulpRules')) {
      game.settings.set('CoC7', 'pulpRuleDoubleMaxHealth', true)
      game.settings.set('CoC7', 'pulpRuleDevelopmentRollLuck', true)
      game.settings.set('CoC7', 'pulpRuleArchetype', true)
      game.settings.set('CoC7', 'pulpRuleOrganization', true)
      game.settings.set('CoC7', 'pulpRuleTalents', true)
      game.settings.set('CoC7', 'pulpRuleFasterRecovery', true)
      game.settings.set('CoC7', 'pulpRuleIgnoreMajorWounds', true)
    }

    const settings = mergeObject(this.updatedModules || {}, this.currentModules)
    game.settings.set('CoC7', 'systemUpdatedModuleVersion', settings)
    game.settings.set('CoC7', 'systemUpdateVersion', game.system.data.version)
  }

  static migrateActorData (actor) {
    const updateData = {}

    // Update World Actor
    Updater._migrateActorCharacterSanity(actor, updateData)
    Updater._migrateActorArtwork(actor, updateData)
    Updater._migrateActorKeeperNotes(actor, updateData)
    Updater._migrateActorNpcCreature(actor, updateData)
    Updater._migrateActorStatusEffectActive(actor, updateData)

    // Migrate World Actor Items
    if (actor.items) {
      const items = actor.items.reduce((arr, i) => {
        const itemData =
          i instanceof CONFIG.Item.documentClass ? i.toObject() : i
        const itemUpdate = Updater.migrateItemData(itemData)
        if (!foundry.utils.isObjectEmpty(itemUpdate)) {
          itemUpdate._id = itemData._id
          arr.push(expandObject(itemUpdate))
        }
        return arr
      }, [])
      if (items.length > 0) {
        updateData.items = items
      }
    }

    return updateData
  }

  static async migrateCompendiumData (pack) {
    const entity = pack.metadata.entity
    if (!['Actor', 'Item', 'Macro', 'RollTable'].includes(entity)) return

    // Unlock the pack for editing
    const wasLocked = pack.locked
    await pack.configure({ locked: false })

    await pack.migrate()
    const documents = await pack.getDocuments()

    // Iterate over compendium entries - applying fine-tuned migration functions
    for (const doc of documents) {
      let updateData = {}
      try {
        switch (entity) {
          case 'Actor':
            updateData = Updater.migrateActorData(doc.toObject())
            break
          case 'Item':
            updateData = Updater.migrateItemData(doc.toObject())
            break
          case 'Macro':
            updateData = Updater.migrateMacroData(doc.toObject())
            break
          case 'RollTable':
            updateData = Updater.migrateTableData(doc.toObject())
            break
        }
        // Save the entry, if data was changed
        if (!foundry.utils.isObjectEmpty(updateData)) {
          console.log(
            `Migrated ${entity} entity ${doc.name} in Compendium ${pack.collection}`
          )
          await doc.update(updateData)
        }
      } catch (err) {
        err.message = `Failed CoC7 system migration for entity ${doc.name} in pack ${pack.collection}: ${err.message}`
        console.error(err)
      }
    }

    // Apply the original locked status for the pack
    await pack.configure({ locked: wasLocked })
  }

  static migrateItemData (item) {
    const updateData = {}

    // Update World Item
    Updater._migrateItemExperience(item, updateData)
    Updater._migrateItemArtwork(item, updateData)
    Updater._migrateItemBookAutomated(item, updateData)
    Updater._migrateItemKeeperNotes(item, updateData)
    Updater._migrateItemSpellAutomated(item, updateData)
    Updater._migrateItemKeeperNotesMerge(item, updateData)
    Updater._migrateItemSetupEras(item, updateData)

    return updateData
  }

  static migrateMacroData (table) {
    const updateData = {}

    // Update World Actor
    Updater._migrateMacroArtwork(table, updateData)

    return updateData
  }

  static migrateTableData (table) {
    const updateData = {}

    // Update World Actor
    Updater._migrateTableArtwork(table, updateData)

    return updateData
  }

  static _migrateItemKeeperNotes (item, updateData) {
    if (
      [
        'archetype',
        'chase',
        'item',
        'occupation',
        'setup',
        'skill',
        'spell',
        'status',
        'talent',
        'weapon'
      ].includes(item.type)
    ) {
      if (typeof item.data.description === 'string') {
        updateData['data.description'] = {
          value: item.data.description,
          keeper: ''
        }
      } else if (typeof item.data.description === 'undefined') {
        updateData['data.description'] = {
          value: '',
          keeper: ''
        }
      } else if (typeof item.data.description.keeper === 'undefined') {
        updateData['data.description.keeper'] = ''
      }
    }
    return updateData
  }

  static _migrateItemExperience (item, updateData) {
    if (item.type === 'skill') {
      if (typeof item.data.adjustments?.experience === 'undefined') {
        updateData['data.adjustments.experience'] = 0
      }
    }
    return updateData
  }

  static _migrateItemArtwork (item, updateData) {
    let image = String(item.img).match(/systems\/CoC7\/artwork\/icons\/(.+)/)
    if (image !== null) {
      updateData.img = 'systems/CoC7/assets/icons/' + image[1]
    }
    if (item.type === 'setup') {
      for (const [k, v] of Object.entries(item.data.items)) {
        image = String(v.img).match(/systems\/CoC7\/artwork\/icons\/(.+)/)
        if (image !== null) {
          if (typeof updateData['data.items'] === 'undefined') {
            updateData['data.items'] = item.data.items
          }
          updateData['data.items'][k].img =
            'systems/CoC7/assets/icons/' + image[1]
        }
      }
    } else if (item.type === 'occupation') {
      for (const [k, v] of Object.entries(item.data.skills)) {
        image = String(v.img).match(/systems\/CoC7\/artwork\/icons\/(.+)/)
        if (image !== null) {
          if (typeof updateData['data.skills'] === 'undefined') {
            updateData['data.skills'] = item.data.skills
          }
          updateData['data.skills'][k].img =
            'systems/CoC7/assets/icons/' + image[1]
        }
      }
      for (const [o, g] of Object.entries(item.data.groups)) {
        for (const [k, v] of Object.entries(g.skills)) {
          image = String(v.img).match(/systems\/CoC7\/artwork\/icons\/(.+)/)
          if (image !== null) {
            if (typeof updateData['data.groups'] === 'undefined') {
              updateData['data.groups'] = item.data.groups
            }
            updateData['data.groups'][o].skills[k].img =
              'systems/CoC7/assets/icons/' + image[1]
          }
        }
      }
    } else if (item.type === 'book') {
      for (const [k, v] of Object.entries(item.data.spells)) {
        image = String(v.img).match(/systems\/CoC7\/artwork\/icons\/(.+)/)
        if (image !== null) {
          if (typeof updateData['data.spells'] === 'undefined') {
            updateData['data.spells'] = item.data.spells
          }
          updateData['data.spells'][k].img =
            'systems/CoC7/assets/icons/' + image[1]
        }
      }
    } else if (item.type === 'archetype') {
      for (const [k, v] of Object.entries(item.data.skills)) {
        image = String(v.img).match(/systems\/CoC7\/artwork\/icons\/(.+)/)
        if (image !== null) {
          if (typeof updateData['data.skills'] === 'undefined') {
            updateData['data.skills'] = item.data.skills
          }
          updateData['data.skills'][k].img =
            'systems/CoC7/assets/icons/' + image[1]
        }
      }
    }
    return updateData
  }

  static _migrateItemSpellAutomated (item, updateData) {
    if (item.type === 'spell' && typeof item.data.cost !== 'undefined') {
      updateData['data.castingTime'] = item.data.castingTime || ''
      updateData['data.costs.hitPoints'] = item.data.cost.hp || 0
      updateData['data.costs.magicPoints'] = item.data.cost.mp || 0
      updateData['data.costs.sanity'] = item.data.cost.san || 0
      updateData['data.costs.power'] = item.data.cost.pow || 0
      updateData['data.costs.others'] = ''

      updateData['data.-=cost'] = null
      updateData['data.description.-=unidentified'] = null
      updateData['data.description.-=notes'] = null
    }
  }

  /**
   * Book automation was increased in 0.6.5
   *
   * @param {object} item Document data expressed as a plain object
   * @param {json} updateData Differential update data which modifies the existing values of this document data
   * @returns {json} Differential update data which modifies the existing values of this document data
   */
  static _migrateItemBookAutomated (item, updateData) {
    if (item.type === 'book') {
      /** If book still has the data.description.unidentified key then run migrate on it */
      if (typeof item.data.description.unidentified !== 'undefined') {
        /** Fields changed from null default to empty string */
        updateData['data.author'] = item.data.author || ''
        updateData['data.date'] = item.data.date || ''
        updateData['data.language'] = item.data.language || ''
        /** Fields changed from null/string defaults to integer to 0 */
        updateData['data.sanityLoss'] = item.data.sanLoss || 0
        updateData['data.mythosRating'] = Number(item.data.mythosRating) || 0
        /** Renamed/moved fields */
        updateData['data.content'] = item.data.description.unidentified
        updateData['data.description.keeper'] = item.data.description.notes
        /** New fields set default values */
        updateData['data.difficultyLevel'] = 'regular'
        updateData['data.fullStudies'] = 0
        updateData['data.initialReading'] = false
        updateData['data.keeperNotes'] = ''
        /** Move and rename gain fields to gains, default NaN values to 0 */
        updateData['data.gains.cthulhuMythos.initial'] =
          Number(item.data.gain.cthulhuMythos.CMI) || 0
        updateData['data.gains.cthulhuMythos.final'] =
          Number(item.data.gain.cthulhuMythos.CMF) || 0
        updateData['data.gains.occult'] = Number(item.data.gain.occult) || 0
        updateData['data.gains.others'] = []
        /** New study field default necessary to integer of weeksStudyTime or 0 if not set */
        updateData['data.study'] = {
          necessary: Number(item.data.weeksStudyTime) || 0,
          progress: 0
        }
        /** Remove old keys */
        updateData['data.-=sanLoss'] = null
        updateData['data.-=weeksStudyTime'] = null
        updateData['data.-=gain'] = null
        updateData['data.description.-=unidentified'] = null
        updateData['data.description.-=notes'] = null
        updateData['data.gains.-=other'] = null
        updateData['data.-=properties'] = null
        updateData['data.-=flags'] = null
      }
    }
    return updateData
  }

  static _migrateItemKeeperNotesMerge (item, updateData) {
    if (item.type === 'spell' || item.type === 'book') {
      if (typeof item.data.notes !== 'undefined') {
        if (typeof item.data.description.keeper !== 'undefined') {
          updateData['data.description.keeper'] =
            item.data.description.keeper + item.data.notes
        } else {
          updateData['data.description.keeper'] = item.data.notes
        }
        updateData['data.-=notes'] = null
      }
      if (typeof item.data.keeperNotes !== 'undefined') {
        if (typeof updateData['data.description.keeper'] !== 'undefined') {
          updateData['data.description.keeper'] =
            item.data.keeperNotes + updateData['data.description.keeper']
        } else {
          updateData['data.description.keeper'] = item.data.keeperNotes
        }
        updateData['data.-=keeperNotes'] = null
      }
    }
  }

  static _migrateItemSetupEras (item, updateData) {
    if (item.type === 'setup') {
      for (const [key, value] of Object.entries(item.data.eras)) {
        if (typeof value.selected !== 'undefined') {
          updateData['data.eras.' + key] = value.selected
        }
      }
    }
  }

  static _migrateActorArtwork (actor, updateData) {
    let image = String(actor.img).match(/systems\/CoC7\/artwork\/icons\/(.+)/)
    if (image !== null) {
      updateData.img = 'systems/CoC7/assets/icons/' + image[1]
    }
    image = String(actor.token.img).match(/systems\/CoC7\/artwork\/icons\/(.+)/)
    if (image !== null) {
      updateData['token.img'] = 'systems/CoC7/assets/icons/' + image[1]
    }
    for (const [k, v] of Object.entries(actor.effects)) {
      image = String(v.icon).match(/systems\/CoC7\/artwork\/icons\/(.+)/)
      if (image !== null) {
        if (typeof updateData.effects === 'undefined') {
          updateData.effects = actor.effects
        }
        updateData.effects[k].icon = 'systems/CoC7/assets/icons/' + image[1]
      }
    }
    return updateData
  }

  static _migrateActorKeeperNotes (actor, updateData) {
    if (['character', 'npc', 'creature'].includes(actor.type)) {
      if (typeof actor.data.description === 'undefined') {
        updateData['data.description'] = {
          keeper: ''
        }
      }
    }
    return updateData
  }

  static _migrateActorStatusEffectActive (actor, updateData) {
    if (
      typeof actor.data.status !== 'undefined' ||
      typeof actor.data.conditions === 'undefined'
    ) {
      updateData['data.conditions.criticalWounds.value'] = false
      updateData['data.conditions.unconscious.value'] = false
      updateData['data.conditions.dying.value'] = false
      updateData['data.conditions.dead.value'] = false
      updateData['data.conditions.prone.value'] = false
      updateData['data.conditions.tempoInsane.value'] = false
      updateData['data.conditions.indefInsane.value'] = false
      if (
        typeof actor.data.status.criticalWounds.value !== 'undefined' &&
        actor.data.status.criticalWounds.value
      ) {
        updateData['data.conditions.criticalWounds.value'] = true
      }
      if (
        typeof actor.data.status.unconscious.value !== 'undefined' &&
        actor.data.status.unconscious.value
      ) {
        updateData['data.conditions.unconscious.value'] = true
      }
      if (
        typeof actor.data.status.dying.value !== 'undefined' &&
        actor.data.status.dying.value
      ) {
        updateData['data.conditions.dying.value'] = true
      }
      if (
        typeof actor.data.status.dead.value !== 'undefined' &&
        actor.data.status.dead.value
      ) {
        updateData['data.conditions.dead.value'] = true
      }
      if (
        typeof actor.data.status.prone.value !== 'undefined' &&
        actor.data.status.prone.value
      ) {
        updateData['data.conditions.prone.value'] = true
      }
      if (
        typeof actor.data.status.tempoInsane.value !== 'undefined' &&
        actor.data.status.tempoInsane.value
      ) {
        updateData['data.conditions.tempoInsane.value'] = true
      }
      if (
        typeof actor.data.status.indefInsane.value !== 'undefined' &&
        actor.data.status.indefInsane.value
      ) {
        updateData['data.conditions.indefInsane.value'] = true
      }
      const effects = actor.effects
      let changed = false
      for (let i = 0, im = effects.length; i < im; i++) {
        const effect = effects[i]
        const match = effect.icon.match(
          /\/(hanging-spider|tentacles-skull|arm-sling|heart-beats|tombstone|knocked-out-stars|falling|skull|unconscious)\./
        )
        if (match !== null) {
          let statusId = ''
          switch (match[1]) {
            case 'hanging-spider':
              statusId = 'tempoInsane'
              break
            case 'tentacles-skull':
              statusId = 'indefInsane'
              break
            case 'arm-sling':
              statusId = 'criticalWounds'
              break
            case 'heart-beats':
              statusId = 'dying'
              break
            case 'tombstone':
            case 'skull':
              statusId = 'dead'
              break
            case 'knocked-out-stars':
            case 'unconscious':
              statusId = 'unconscious'
              break
            case 'falling':
              statusId = 'prone'
              break
          }
          if (statusId !== '') {
            if (!updateData[`data.conditions.${statusId}.value`]) {
              updateData[`data.conditions.${statusId}.value`] = true
              changed = true
            }
            if (effect.flags.core?.statusId !== statusId) {
              effects[i] = mergeObject(effect, {
                flags: {
                  core: {
                    statusId: statusId
                  }
                }
              })
              changed = true
            }
          }
        }
      }
      if (changed) {
        updateData.effects = effects
      }
      updateData['data.-=status'] = null
    }
    return updateData
  }

  static _migrateActorNpcCreature (actor, updateData) {
    if (['npc'].includes(actor.type)) {
      if (typeof actor.data.special === 'undefined') {
        updateData['data.special'] = {
          checkPassed: null,
          checkFailled: null
        }
      }
      if (typeof actor.data.attacksPerRound === 'undefined') {
        updateData['data.attacksPerRound'] = 1
      }
    }
    return updateData
  }

  static _migrateActorCharacterSanity (actor, updateData) {
    if (actor.type === 'character') {
      const oneFifthSanity = Math.ceil(actor.data.attribs.san.value / 5)
      if (
        typeof actor.data.attribs.san.dailyLoss === 'undefined' ||
        actor.data.attribs.san.dailyLoss === null
      ) {
        updateData['data.attribs.san.dailyLoss'] = 0
      }
      if (
        typeof actor.data.attribs.san.oneFifthSanity === 'undefined' ||
        actor.data.attribs.san.oneFifthSanity === null
      ) {
        updateData['data.attribs.san.oneFifthSanity'] = ' / ' + oneFifthSanity
      }
      if (
        typeof actor.data.attribs.san.dailyLoss === 'undefined' ||
        actor.data.attribs.san.dailyLoss === null
      ) {
        updateData['data.attribs.san.dailyLoss'] = 0
      }
      if (
        typeof actor.data.indefiniteInsanityLevel === 'undefined' ||
        actor.data.indefiniteInsanityLevel === null ||
        typeof actor.data.indefiniteInsanityLevel.value === 'undefined' ||
        actor.data.indefiniteInsanityLevel.value === null
      ) {
        updateData['data.indefiniteInsanityLevel.value'] = 0
      }
      if (
        typeof actor.data.indefiniteInsanityLevel === 'undefined' ||
        actor.data.indefiniteInsanityLevel === null ||
        typeof actor.data.indefiniteInsanityLevel.max === 'undefined' ||
        actor.data.indefiniteInsanityLevel.max === null
      ) {
        updateData['data.indefiniteInsanityLevel.max'] = oneFifthSanity
      }
      if (
        typeof actor.data.attribs.mp.value === 'undefined' ||
        actor.data.attribs.mp.value === null
      ) {
        updateData['data.attribs.mp.value'] = oneFifthSanity
      }
      if (
        typeof actor.data.attribs.mp.max === 'undefined' ||
        actor.data.attribs.mp.max === null
      ) {
        updateData['data.attribs.mp.max'] = oneFifthSanity
      }
      if (
        typeof actor.data.notes === 'undefined' ||
        actor.data.notes === null
      ) {
        updateData['data.notes'] = ''
      }
    }
    return updateData
  }

  static _migrateMacroArtwork (table, updateData) {
    const image = String(table.img).match(/systems\/CoC7\/artwork\/icons\/(.+)/)
    if (image !== null) {
      updateData.img = 'systems/CoC7/assets/icons/' + image[1]
    }
    return updateData
  }

  static _migrateTableArtwork (table, updateData) {
    let image = String(table.img).match(/systems\/CoC7\/artwork\/icons\/(.+)/)
    if (image !== null) {
      updateData.img = 'systems/CoC7/assets/icons/' + image[1]
    }
    for (const [k, v] of Object.entries(table.results)) {
      image = String(v.img).match(/systems\/CoC7\/artwork\/icons\/(.+)/)
      if (image !== null) {
        if (typeof updateData.results === 'undefined') {
          updateData.results = table.results
        }
        updateData.results[k].img = 'systems/CoC7/assets/icons/' + image[1]
      }
    }
    return updateData
  }
}
