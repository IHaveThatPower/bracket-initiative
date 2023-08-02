export class BracketInitiative
{
	static MODULE_NAME = 'bracket-initiative';
	static SOCKET_NAME = 'module.bracket-initiative';

	static FLAG_ROLL_RESULT = 'roll-result';

	/**
	 * Helper for printing diagnostic messages, if enabled
	 *
	 * @param	mixed
	 * @return	void
	 */
	static debug()
	{
		const self = BracketInitiative;
		if (CONFIG.debug.BracketInitiative)
			console.log("BracketInitiative |", arguments);
	}

	/**
	 * Execute socket calls or respond to them
	 *
	 * @param	object payload
	 * @return	void
	 */
	static async handleUpdate(payload)
	{
		const self = BracketInitiative;

		// Only the GM handles socket updates
		if (!self.isUpdateGM())
			return;

		if (payload?.type === 'initiative')
		{
			self.debug(payload);
			if (payload?.combatant)
				self.checkForFollowUpdates(payload.combatant);
		}
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
		const self = BracketInitiative;

		if (!self.isUpdateGM())
			return;

		// At the top of a new round, clear all initiative rolls
		if (eventType == "round")
		{
			await combat.resetAll();
		}
	}

	/**
	 * Handle a combatant-related update event that we care about
	 *
	 * @param	Combatant combatant
	 * @param	object update
	 * @return	void
	 */
	static async handleCombatantEvent(combatant, update)
	{
		const self = BracketInitiative;
		self.debug("Handling Combatant Event");
		// If the update didn't pertain to initiative, we don't care
		if (!update?.hasOwnProperty('initiative'))
		{
			self.debug("Non-initiative update; we don't care", update);
			return;
		}

		// If the update was to clear out initiative, don't fight with it
		if (update.intiative == 'undefined' || update.initiative == null)
		{
			self.debug("Initiative update was a reset; leaving alone");
			return;
		}
		self.debug(update);

		self.handleUpdate({
			type: 'initiative',
			combatant: combatant?.id
		});
		return;
	}

	/**
	 * Upon rolling initiative for all (or NPCs), set the turn order
	 * tracker to the first turn and address any linked initiatives.
	 *
	 * @return	void
	 */
	static async rollAllInitiativeCallback()
	{
		self = BracketInitiative;
		if (!self.isUpdateGM() || !game.combats.active)
			return;

		// Wait until all the initiative rolls are finished coming in, then
		// reset the turn order to 0
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

		// Scan combatants for followers and update accordingly
		for (let combatant of game.combats.active.combatants)
		{
			self.checkForFollowUpdates(combatant.id);
		}
	}

	/**
	 * Upon rolling individual initiative, if the combatant is a follower,
	 * follow its parent, if able. Alternately, if the combatant *has*
	 * followers, update them.
	 *
	 * @param   {string}combatantId
	 * @return	bool	Whether or not we updated the combatant
	 */
	static async checkForFollowUpdates(combatantId)
	{
		const self = BracketInitiative;
		if (!game.combats.active || !combatantId)
		{
			self.debug("No combats active, or combatantId not supplied");
			self.debug(combatantId);
			return false;
		}
		const combatant = game.combats.active.combatants.get(combatantId);
		if (!combatant)
		{
			self.debug("Combatant not found");
			return false;
		}

		let followedInitiative = await self.followLeader(combatant);
		self.leadFollowers(combatant);
		return followedInitiative;
	}

	/**
	 * Do we follow a leader?
	 *
	 * @param	Combatant combatant
	 * @return	bool	Whether or not we followed
	 */
	static async followLeader(combatant)
	{
		const self = BracketInitiative;
		// Is this combatant a follower?
		const followedName = combatant?.actor?.getFlag(self.MODULE_NAME, 'follow');
		if (followedName)
		{
			// Is their followed character in this combat?
			const followed = game.combats.active.combatants.filter(c => c.name == followedName);
			if (!followed || followed.length == 0)
			{
				self.debug("Followed combatant", followedName, "is not in this combat");
				return false;
			}
			else if (!isNaN(Number(followed[0].initiative)) && followed[0].initiative != null)
			{
				self.debug("Overriding initiative with that of followed combatant");
				await combatant.update({'initiative': followed[0].initiative});
				return true;
			}
			self.debug("Followed combatant", followedName, "doesn't yet have a valid initiative");
			return false;
		}
		self.debug("Not following anyone");
		return false;
	}

	/**
	 * Do we lead followers?
	 *
	 * @param	Combatant combatant
	 * @return	bool	Whether or not we were the leader
	 */
	static leadFollowers(combatant)
	{
		const self = BracketInitiative;
		// Does this combatant have any followers?
		const followers = game.combats.active.combatants.filter((c) => c.actor?.getFlag(self.MODULE_NAME, 'follow') || false);

		// Are any of them followers of this combatant?
		if (followers.length > 0)
		{
			for (const f of followers)
			{
				if (f.actor?.getFlag(self.MODULE_NAME, 'follow') === combatant.actor.name)
					self.checkForFollowUpdates(f.id);
			}
		}
		self.debug("No followers");
	}

	/**
	 * Determine whether or not the current user is the "update GM"
	 *
	 * To be the "update GM" the user must be both a GM and the
	 * "active" GM with the lowest user ID
	 *
	 * @return	bool
	 */
	static isUpdateGM()
	{
		return game.user.isGM && !(game.users.filter(user => user.isGM && user.active).some(other => other._id < game.user._id));
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
	 * For the GM, enhance the combat tracker to clearly dilineate
	 * brackets.
	 *
	 * @param
	 * @return	void
	 */
	static enhanceCombatTracker(html)
	{
		// Only GMs see this
		if (!game.user.isGM)
			return;
		const combatantItems = html[0].querySelectorAll('li.combatant');
		const bracketSets = ['bracket-odd', 'bracket-even'];
		let currentBracketSet;
		let lastHadPlayerOwner = false;
		for (let c of combatantItems)
		{
			const combatantId = c.dataset.combatantId;
			const combatant = game.combats.active.combatants.get(combatantId);
			if (
				(combatant.hasPlayerOwner && !lastHadPlayerOwner) ||
				(!combatant.hasPlayerOwner && lastHadPlayerOwner)
			)
			{
				if (isNaN(Number(currentBracketSet)))
					currentBracketSet = 0;
				else
					currentBracketSet = Math.abs(currentBracketSet - 1);
				lastHadPlayerOwner = combatant.hasPlayerOwner;
			}
			c.classList.add(bracketSets[currentBracketSet]);
		}
	}
}
