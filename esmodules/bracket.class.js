export class BracketInitiative
{
	static MODULE_NAME = 'bracket-initiative';
	static SOCKET_NAME = 'module.bracket-initiative';

	/*
	static FLAG_ACTION_CHOSEN = 'action-chosen';
	static FLAG_ACTION_TARGET = 'action-target';
	static FLAG_LAST_ACTION = 'last-action';

	static FLAG_BONUS_ACTION_CHOSEN = 'bonus-action-chosen';
	static FLAG_BONUS_ACTION_TARGET = 'bonus-action-target';
	static FLAG_LAST_BONUS_ACTION = 'last-bonus-action';
	*/

	static FLAG_ROLL_RESULT = 'roll-result';

	/**
	 * Execute socket calls or respond to them
	 *
	 * @param	string settingName
	 * @param	object settingPayload
	 * @param	bool [optional] reRenderUI
	 * @param	bool [optional] fromSocket
	 * @return	void
	 */
	static async handleUpdate(payload)
	{
		// To be the "update GM" the user must be both a GM and the
		// "active" GM with the lowest user ID
		const isUpdateGM = game.user.isGM && !(game.users.filter(user => user.isGM && user.active).some(other => other._id < game.user._id));
		if (payload.showSelect && !isUpdateGM)
		{
			BracketInitiative.supplyInitiativeRoll();
		}
		else if (payload.token && payload.explicitRoll)
		{
			if (isUpdateGM)
			{
				// Set the action flags
				const combatant = game.combats.active.combatants.find((c) => c.token.id == payload.token);
				if (!combatant)
				{
					ui.notifications.warn(`Tried to update token ${payload.token}, but it wasn't in the combatant list`);
					return;
				}
				if (payload.explicitRoll)
					await combatant.setFlag(BracketInitiative.MODULE_NAME, BracketInitiative.FLAG_ROLL_RESULT, payload.explicitRoll);
			}
			else
			{
				// Sanity check this user is allowed to do this
				const affectableTokens = BracketInitiative.getLegalTokens();
				if (!(affectableTokens.find((token) => token.id == payload.token)))
					return;

				console.log("BracketInitiative | Emitting socket event with payload", payload);
				game.socket.emit(BracketInitiative.SOCKET_NAME, payload);
			}
		}
	}

	/**
	 * Assuming conditions permit, display the dialog to supply a manual
	 * initiative roll for the selected token(s).
	 *
	 * @param {string} combatantId  Optional ID of a combatant to choose an action for
	 * @return	bool
	 */
	static supplyInitiativeRoll(combatantId)
	{
		// Make sure an encounter exists!
		if (!game.combat)
		{
			ui.notifications.error('Cannot choose a round action outside of combat!');
			return false;
		}

		// Determine what tokens we can affect
		const affectTokens = BracketInitiative.getTokenListForDialog(combatantId);
		if (!affectTokens)
			return false;

		(async function(affectTokens)
		{
			for (let i = 0; i < affectTokens.length; i++)
			{
				if (!BracketInitiative.canTokenRollInitiative(affectTokens[i]))
				{
					ui.notifications.warn("Only the GM can modify initiative once it has been rolled for the round");
					continue;
				}
				/*
				const dialogData = {
				};
				const dialogContent = await renderTemplate(
					"modules/bracket-initiative/templates/initiative.html",
					dialogData
				);
				const name = affectTokens[i].name;
				new Dialog({
					title: `Supply Manual Initiative: ${name}`,
					content: dialogContent,
					buttons: {
						yes:{
							icon: '<i class="fas fa-dice-d20"></i>',
							label: 'Set Action',
							callback: (html) => {
								BracketInitiative.setAction(affectTokens[i], html);
							}
						},
						no:{
							icon: '<i class="fas fa-times-circle"></i>',
							label: 'Cancel'
						}
					}
				}).render(true);
				*/
				// console.log(affectTokens.combatant.rollInitiativeDialog();
			}
		})(affectTokens);
		return true;
	}

	/**
	 * Determine what set of tokens should be operated on for
	 * supplyInitiativeRoll()
	 *
	 * @param {string} combatantId	Optional specific combatant
	 * @return {mixed}	Array of tokens on success, false on error
	 */
	static getTokenListForDialog(combatantId)
	{
		const activeCombatants = game.combats.active.combatants;
		let affectTokens = [];
		if (combatantId)
		{
			// Find token corresponding to combatant
			const combatant = activeCombatants.find(ac => ac.id == combatantId);
			const affectableTokens = BracketInitiative.getLegalTokens();
			affectTokens = affectableTokens.filter(at => at.id == combatant.tokenId);
			if (affectTokens.length == 0)
			{
				if (game.user.isGM)
					ui.notifications.error("Token for that combatant was not found");
				else
					ui.notifications.error("You don't own that combatant's token");
				return false;
			}
		}
		else if (game?.canvas?.tokens?.controlled?.length > 0)
		{
			// Filter the list down to just active combatants
			const controlledTokens = game.canvas.tokens.controlled;
			const affectableTokens = BracketInitiative.getLegalTokens();
			affectTokens = activeCombatants.filter(ac =>
				controlledTokens.find((ct) => ct.id == ac.token.id) &&
				affectableTokens.find((aft) => aft.id == ac.token.id)
			)?.map(ac => ac.token);
			if (affectTokens.length == 0)
			{
				ui.notifications.error("None of the tokens selected can be affected. Try deselecting, or selecting different tokens");
				return false;
			}
		}
		else
		{
			const ownedTokens = canvas.tokens.ownedTokens;
			affectTokens = activeCombatants.filter(ac => ownedTokens.find((ot) => ot.id == ac.token.id))?.map(ac => ac.token);

			// If we get here, something went screwy; let the user know
			if (affectTokens.length == 0)
			{
				ui.notifications.error("No tokens found that could be affected");
				return false;
			}
		}
		return affectTokens;
	}

	/**
	 * Determine what tokens the current user can legally affect
	 *
	 * @return	{array}
	 */
	static getLegalTokens()
	{
		const controlledTokens = canvas.tokens.controlled;
		const ownedTokens = canvas.tokens.ownedTokens;
		let affectableTokens = controlledTokens.concat(ownedTokens);
		affectableTokens = [...new Map(affectableTokens.map((m) => [m.id, m])).values()];
		return affectableTokens;
	}

	/**
	 * Determine if the token's in a state where it's legal for it to
	 * choose its next action
	 *
	 * @param	{Token} token
	 * @return	bool
	 */
	static canTokenRollInitiative(token)
	{
		if (game.user.isGM)
			return true;
		// Initiative has already been rolled for all active combatants?
		const combatants = game.combats.active.combatants;
		let allRolled = true;
		for (let c of combatants)
		{
			// Only truly dead combatants are ignored
			const isDead = BracketInitiative.isDead(c.token)
			if (!isDead && (c.initiative == null || typeof c.initiative == 'undefined'))
			{
				allRolled = false;
				break;
			}
		}
		return !allRolled;
	}

	/**
	 * Invoked by the Choose Round Action dialog when an action is chosen
	 *
	 * @param	token
	 * @param	html
	 * @return	void
	 */
	static async setAction(token, html)
	{
		const formData = (new FormDataExtended(html[0].querySelector('form.speedFactorInitiative'))).object;
		if (!(formData['init-mod-action'] in BracketInitiative.actionModifiers) || !(formData['init-mod-bonus-action'] in BracketInitiative.actionModifiers))
		{
			ui.notifications.error("Invalid action selection");
			BracketInitiative.supplyInitiativeRoll(token.combatant.id);
			return;
		}
		if (formData['init-roll'] && (!(Number.isNumeric(formData['init-roll'])) || !(Number.isInteger(Number.fromString(formData['init-roll'])))))
		{
			ui.notifications.error("Initiative roll must be a valid integer");
			BracketInitiative.supplyInitiativeRoll(token.combatant.id);
			return;
		}
		const payload = {
			token: token.id,
			actionChosen: formData['init-mod-action'],
			actionTarget: formData['action-target'],
			bonusActionChosen: formData['init-mod-bonus-action'],
			bonusActionTarget: formData['bonus-action-target'],
			explicitRoll: formData['init-roll']
		};
		BracketInitiative.handleUpdate(payload);
	}

	/**
	 * Handle a combat event that we care about
	 *
	 * @param	string eventType
	 * @param	Combat combat
	 * @param	object round
	 * @param	object time
	 * @return	void
	 */
	static async handleCombatEvent(eventType, combat, round, time)
	{
		console.log("BracketInitiative | event type", eventType, "combat", combat, "round", round, "time", time);
		// At the top of a new round, clear all initiative rolls
		if (eventType == "round")
		{
			console.log("Reset all");
			await combat.resetAll();
		}
		/*
		// Then display a prompt to each player to select an action
		if ((eventType == "start" || eventType == "round") && game.user.isGM)
		{
			game.socket.emit(BracketInitiative.SOCKET_NAME, {'showSelect': true});
		}
		*/
		// If turn advancement occurred, do a sanity check to ensure all combatants chose an action
		/*
		if (eventType == "turn")
		{
			if (!BracketInitiative.checkActionsChosen(combat, round))
				return;
			if (!BracketInitiative.checkInitiativeRolled(combat, round))
				return;
		}
		*/
	}

	/**
	 * When a turn is advanced, check to ensure all combatants have a
	 * chosen action and abort advancement if not.
	 *
	 * @return	{bool}
	 */
	static checkActionsChosen(combat, round)
	{
		// TODO: This is probably not necessary
		// No combatants = nothing to do
		if (combat.combatants?.size == 0)
		{
			return true;
		}
		for (let combatant of combat.combatants)
		{
			const isDead = BracketInitiative.isDead(combatant.token);
			if (!(isDead) && (!combatant.getFlag(BracketInitiative.MODULE_NAME, BracketInitiative.FLAG_ACTION_CHOSEN) || !combatant.getFlag(BracketInitiative.MODULE_NAME, BracketInitiative.FLAG_BONUS_ACTION_CHOSEN)))
			{
				if (combatant.isNPC == false || game.user.isGM) // TODO: Should check player-is-owner, not isNPC; wrap into function
				{
					ui.notifications.warn(`Combatant ${combatant.name} must choose actions!!`);
				}
				else
				{
					ui.notifications.warn("A combatant still needs to choose actions!");
				}
				if (game.user.isGM)
				{
					combat.update({'turn': 0});
					round.turn = 0;
				}
				return false;
			}
		}
		return true;
	}

	/**
	 * When a turn is advanced, check to ensure all combatants have rolled
	 * initiative and abort advancement if not.
	 *
	 * @return	{bool}
	 */
	static checkInitiativeRolled(combat, round)
	{
		// TODO: Probably don't need this anymore
		// No combatants = nothing to do
		if (combat.combatants?.size == 0)
		{
			return true;
		}
		for (let combatant of combat.combatants)
		{
			const isDead = BracketInitiative.isDead(combatant.token);
			if (!(isDead) && (typeof combatant.initiative == 'undefined' || combatant.initiative == null))
			{
				if (combatant.isNPC == false || game.user.isGM) // TODO: Should check player-is-owner, not isNPC; wrap into function
				{
					ui.notifications.warn(`Combatant ${combatant.name} must roll initiative!`);
				}
				else
				{
					ui.notifications.warn("A combatant still needs to roll initiative!");
				}
				if (game.user.isGM)
				{
					combat.update({'turn': 0});
					round.turn = 0;
				}
				return false;
			}
		}
		return true;
	}

	/**
	 * Check that an imminent updateCombatant call can be made
	 *
	 * @param {object} combatant
	 * @param {object} update
	 * @params {object} args
	 * @params {string} userId
	 * @retur	bool
	 */
	static validateCanUpdate(combatant, update, args, userId)
	{
		if (update.initiative && !game.users.get(userId).isGM)
		{
			combatant.initiative = null;
			update.initiative = null;
			update._id = undefined;
			args.diff = false;
			args.render = false;
			ui.notifications.error("You cannot affect initiative manually");
			return false;
		}
		return true;
	}

	/**
	 * Determine if the indicated token is dead
	 *
	 * @param	{Token}
	 * @return	{bool}
	 */
	static isDead(token)
	{
		return token?.actorData?.effects?.find((e) => e.label == 'Dead');
	}

	/**
	 * Upon rolling initiative for all (or NPCs), set the turn order
	 * tracker to the first turn and address any linked initiatives.
	 *
	 * @return	void
	 */
	static async rollInitiativeCallback()
	{
		if (!game.user.isGM || !game.combats.active)
			return;

		await (async function() {
			const poll = resolve => {
				if (game.combats.active.combatants.filter(c => (typeof c.initiative == "undefined" || c.initiative == null)).length == 0)
				{
					resolve();
				}
				else setTimeout(_ => poll(resolve), 100);
			}
			return new Promise(poll);
		})();
		game.combats.active.update({'turn': 0});

		// Scan combatants for followers
		for (let combatant of game.combats.active.combatants)
		{
			const followedName = combatant?.token?.actor?.flags['bracket-initiative']?.follow;
			if (!followedName)
			{
				continue;
			}
			const followed = game.combats.active.combatants.filter(c => c.name == followedName);
			if (!followed || followed.length == 0)
			{
				continue;
			}
			if (typeof followed[0].initiative != "undefined")
			{
				combatant.update({'initiative': followed[0].initiative});
			}
		}
	}

	/**
	 * Enhance the roll dialog specifically for initiative rolls
	 *
	 * @param
	 * @param
	 * @param
	 * @return	void
	 */
	static async enhanceInitiativeDialog(dialog, $html, appData)
	{
		const html = $html[0];
		const { title } = dialog.data;
		const initiativeText = game.i18n.localize('DND5E.InitiativeRoll');
		if (!title.includes(initiativeText)) return;

		// Inject manual roll field
		const manualRollContainer = document.createElement('div');
		manualRollContainer.classList.add('form-group');
		const manualRollLabel = document.createElement('label');
		manualRollLabel.innerHTML = 'Raw Manual Roll';
		manualRollContainer.append(manualRollLabel);
		const manualRollInput = document.createElement('input');
		manualRollInput.setAttribute('type', 'text');
		manualRollInput.setAttribute('name', 'manual');
		manualRollInput.setAttribute('placeholder', 'Optional: physical die roll, no mods');
		manualRollInput.setAttribute('title', "If desired, input the result of your physical die roll here.\nDo not include any modifiers; Foundry will add those, or use the field above.");
		manualRollContainer.append(manualRollInput);
		const bonusContainer = html.querySelector('form').querySelector('input[name=bonus]').parentNode;
		html.querySelector('form').insertBefore(manualRollContainer, bonusContainer.nextSibling);
		html.style.height = 'auto';
	}

	/**
	 * Patch the normal _onDialogSubmit method of D20Roll
	 *
	 * @param
	 * @param
	 * @return	D20Roll instance
	 */
	static patchD20RollOnDialogSubmit(roll, html)
	{
		const form = html[0].querySelector('form');
		const manualInput = form.querySelector('input[name=manual]');
		if (manualInput)
		{
			const explicitRoll = Number(manualInput.value);
			if (explicitRoll && !isNaN(explicitRoll))
			{
				// Handle the first-term override
				roll.terms[0].results = [{active: true, result: Number(explicitRoll)}];
				roll.terms[0]._evaluated = true;

				// Represent it in the formula
				let formula = roll._formula;
				formula = formula.replace(/(1d20|2d20k.)/, explicitRoll);

				// Clean up "+ -" instances and update the formula
				formula = formula.replaceAll('+ -', '- ');
				roll._formula = formula;
			}
		}
		return roll;
	}

	/**
	 * Patch the combatant sorting so that NPCs are always sorted after
	 * PCs and we otherwise sort alphabetically by combatant name.
	 *
	 * @param
	 * @param
	 * @return
	 */
	static wrappedSortCombatants(a, b)
	{
		const ia = Number.isNumeric(a.initiative) ? a.initiative : -Infinity;
		const ib = Number.isNumeric(b.initiative) ? b.initiative : -Infinity;
		if ((ib - ia) == 0)
		{
			if (a.isNPC && !b.isNPC)
				return 1;
			if (!a.isNPC && b.isNPC)
				return -1;
			return (a.name > b.name ? 1 : -1);
		}
		return (ib - ia);
	}
}
