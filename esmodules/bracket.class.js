export class BracketInitiative
{
	static MODULE_NAME = 'bracket-initiative';
	static SOCKET_NAME = 'module.bracket-initiative';

	static FLAG_ROLL_RESULT = 'roll-result';

	static log = window.console.log.bind(window.console, "BracketInitiative | ");
	static error = window.console.error.bind(window.console, "BracketInitiative | ");

	/**
	 * Helper for printing diagnostic messages, if enabled
	 *
	 * @param	mixed
	 * @return	void
	 */
	static get debug()
	{
		if (CONFIG.debug.BracketInitiative)
			return true;
		return false;
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
			if (self.debug) self.log(payload);
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
			// Clear out any existing bracket flags
			for (let c of game.combats.active.combatants)
			{
				if (c?.getFlag(self.MODULE_NAME, 'bracket'))
					c.actor.setFlag(self.MODULE_NAME, 'bracket', -1);
			}
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
		if (self.debug) self.log("Handling Combatant Event");
		// If the update didn't pertain to initiative, we don't care
		if (!update?.hasOwnProperty('initiative'))
		{
			if (self.debug) self.log("Non-initiative update; we don't care", update);
			return;
		}

		// If the update was to clear out initiative, don't fight with it
		if (update.intiative == 'undefined' || update.initiative == null)
		{
			if (self.debug) self.log("Initiative update was a reset; leaving alone");
			return;
		}
		if (self.debug) self.log(update);

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
			if (self.debug) self.log("No combats active, or combatantId not supplied");
			if (self.debug) self.log(combatantId);
			return false;
		}
		const combatant = game.combats.active.combatants.get(combatantId);
		if (!combatant)
		{
			if (self.debug) self.log("Combatant not found");
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
				if (self.debug) self.log("Followed combatant", followedName, "is not in this combat");
				return false;
			}
			else if (!isNaN(Number(followed[0].initiative)) && followed[0].initiative != null)
			{
				if (self.debug) self.log("Overriding initiative with that of followed combatant");
				await combatant.update({'initiative': followed[0].initiative});
				return true;
			}
			if (self.debug) self.log("Followed combatant", followedName, "doesn't yet have a valid initiative");
			return false;
		}
		if (self.debug) self.log("Not following anyone");
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
		if (self.debug) self.log("No followers");
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
	 * Patch an initiative roll
	 *
	 * @param
	 * @return	D20Roll instance
	 */
	static patchInitiativeRoll(roll)
	{
		const self = BracketInitiative;
		if (roll.options.manualResult)
		{
			const explicitRoll =  Number(roll.options.manualResult);
			// Handle the first-term override
			roll.terms[0] = new CONFIG.Dice.D20Die();
			roll.terms[0].results = [{active: true, result: explicitRoll}];
			roll.terms[0]._evaluated = true;

			// Represent it in the formula
			let formula = roll._formula;
			formula = formula.replace(/(1d20|2d20k.)/, explicitRoll);

			// Clean up "+ -" instances and update the formula
			formula = formula.replaceAll('+ -', '- ');
			roll._formula = formula;
		}
		return roll;
	}

	/**
	 * Enhance the pre-v4.1 roll dialog specifically for initiative rolls
	 *
	 * @param
	 * @param
	 * @param
	 * @return	void
	 */
	static async enhanceLegacyInitiativeDialog(dialog, $html, appData)
	{
		const self = BracketInitiative;
		const html = $html;
		const { title } = dialog.data;
		const initiativeText = game.i18n.localize('DND5E.InitiativeRoll');
		if (!title.includes(initiativeText)) return;

		// Inject manual roll field
		const manualRollContainer = self.createInitiativeDialogManualInput();
		const bonusContainer = html.querySelector('form').querySelector('input[name=bonus]').parentNode;
		html.querySelector('form').insertBefore(manualRollContainer, bonusContainer.nextSibling);
		html.style.height = 'auto';
	}

	/**
	 * Enhance the v4.1+ roll dialog specifically for initiative rolls
	 *
	 * @param
	 * @param
	 * @return	void
	 */
	static async enhanceInitiativeDialog(roll, dialog)
	{
		const self = BracketInitiative;
		const html = dialog;
		const formGroupID = self.MODULE_NAME + '_manual-roll-group';
		// Avoid multiple adds
		if (html.querySelector('#' + formGroupID))
			return;

		// Inject manual roll field
		const manualRollContainer = self.createInitiativeDialogManualInput(formGroupID);
		const firstFieldSetFormGroup = html.querySelector('form').querySelector('fieldset .form-group');
		html.querySelector('form').querySelector('fieldset').insertBefore(manualRollContainer, firstFieldSetFormGroup);
		html.style.height = 'auto';
	}
	
	/**
	 * Create an extra dialog field on the initiative dialog.
	 * This method is called by the method responsible for inserting
	 * the new field, depending on which version of dnd5e is being used
	 * 
	 * @param
	 * @return	DOMElement
	 */
	static createInitiativeDialogManualInput(formGroupID)
	{
		// Form Group container
		const manualRollContainer = document.createElement('div');
		manualRollContainer.classList.add('form-group');
		manualRollContainer.id = formGroupID;

		// Field label
		const manualRollLabel = document.createElement('label');
		manualRollLabel.innerHTML = 'Raw Manual Roll';
		manualRollContainer.append(manualRollLabel);

		// Wrapper element
		const manualRollFieldWrapper = document.createElement('div');
		manualRollFieldWrapper.classList.add('form-fields');
		manualRollContainer.append(manualRollFieldWrapper);

		// Input element
		const manualRollInput = document.createElement('input');
		manualRollInput.setAttribute('type', 'text');
		manualRollInput.setAttribute('name', 'manual');
		manualRollInput.setAttribute('placeholder', 'Optional: physical die roll, no mods');
		manualRollInput.setAttribute('title', "If desired, input the result of your physical die roll here.\nDo not include any modifiers; Foundry will add those, or use the field above.");
		manualRollFieldWrapper.append(manualRollInput);

		return manualRollContainer;
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
		const self = BracketInitiative;
		const combatants = game?.combats?.active?.combatants || [];
		if (!combatants?.contents || combatants?.contents?.length == 0)
			return; // Nothing to do

		// Get the sorted list of combatant IDs
		const sortedCombatants = combatants.filter(
			c => (c.initiative != null)
		)?.sort(
			(a, b) => self.combatantSort(a, b)
		)?.map(c => { const cObj = {'id': c.id, 'initiative': c.initiative, 'bracket': -1}; return cObj }) || [];
		if (self.debug)
			self.log(sortedCombatants);
		if (!sortedCombatants || sortedCombatants.length == 0)
			return; // Nothing to do

		// Clear existing "Here Be Bad Guys"
		html.querySelectorAll('bracket-divider').forEach(d => d.remove());

		// Determine brackets
		let lastWasAlly = self.isPlayerAlly(combatants.get(sortedCombatants[0].id));
		let currentBracket = 0;
		for (let i = 0; i < sortedCombatants.length; i++)
		{
			const combatantId = sortedCombatants[i].id;
			const combatant = combatants.get(combatantId);
			if (
				self.isPlayerAlly(combatant) && !lastWasAlly ||
				!self.isPlayerAlly(combatant) && lastWasAlly
			)
			{
				currentBracket++;
			}
			sortedCombatants[i].bracket = currentBracket;
			lastWasAlly = false;
			if (self.isPlayerAlly(combatant))
				lastWasAlly = true;
		}
		if (self.debug)
			self.log(sortedCombatants);

		// Indicate brackets
		const combatantItems = html.querySelectorAll('li.combatant');
		const bracketSets = ['bracket-odd', 'bracket-even'];
		const bracketTeam = ['player-combatant', 'npc-combatant'];
		let currentBracketSet = 0;
		let lastBracket = -1;
		let lastCombatant = Array.from(combatantItems).filter(c => { return (sortedCombatants.filter(sc => sc.id == c.dataset.combatantId)[0]?.bracket > -1); }).pop();
		for (let c of combatantItems)
		{
			const combatantId = c.dataset.combatantId;
			const bracketCombatant = sortedCombatants.filter(c => c.id == combatantId)[0];
			if (!bracketCombatant)
			{
				if (self.debug) self.log("Displayed combatant",combatantId,"not in the active combatants list");
				c.classList.add('needs-roll');
				continue;
			}
			
			// Handle bracket grouping
			if (lastBracket == -1)
			{
				lastBracket = bracketCombatant.bracket;
				// If brackets exist before this one, bad guys go first!
				if (lastBracket !== sortedCombatants[0].bracket && !game.user.isGM)
					self.hereBeBadGuys(c);
			}
			// If the last bracket we checked isn't the same as this
			// displayed combatant's bracket, bad guys went before!
			if (lastBracket != bracketCombatant.bracket)
			{
				currentBracketSet = Math.abs(currentBracketSet - 1);
				// For players, insert text
				if (!game.user.isGM)
					self.hereBeBadGuys(c);
			}
			c.classList.add(bracketSets[currentBracketSet]);
			
			// Handle character type
			if (combatants.get(combatantId).hasPlayerOwner)
				c.classList.add(bracketTeam[0]);
			else
				c.classList.add(bracketTeam[1]);
			// Update last bracket
			lastBracket = bracketCombatant.bracket;
		}
		// If there are further brackets than lastBracket, we've got
		// bad guys at the end!
		if (sortedCombatants && sortedCombatants[sortedCombatants.length - 1].bracket !== lastBracket && lastCombatant)
			self.hereBeBadGuys(lastCombatant, true);
	}
	
	/**
	 * Sort a given set of combatant pseudo-objects
	 * 
	 * @param	a
	 * @param	b
	 * @return	int
	 */
	static combatantSort(a, b)
	{
		const self = BracketInitiative;

		// Initiative supersedes
		if (a.initiative > b.initiative) return -1; 
		if (b.initiative > a.initiative) return 1;

		// Allies supersede enemies
		if (self.isPlayerAlly(a) && !self.isPlayerAlly(b)) return -1;
		if (self.isPlayerAlly(b) && !self.isPlayerAlly(a)) return 1;
		
		// Players supersede NPCs
		if (a.hasPlayerOwner && !b.hasPlayerOwner) return -1;
		if (b.hasPlayerOwner && !a.hasPlayerOwner) return 1;

		// Dex score supersedes
		const aDex = a.actor?.system?.abilities?.dex?.value;
		const bDex = b.actor?.system?.abilities?.dex?.value;
		if (aDex > bDex) return -1;
		if (aDex < bDex) return 1;

		// Name supersedes
		if (a.name < b.name) return -1;
		if (b.name < a.name) return 1;
		return 0;
	}
	
	/**
	 * Determine whether or not a combatant is an ally of the players
	 * 
	 * @param	c
	 * @return	bool
	 */
	static isPlayerAlly(c)
	{
		// Players are allies
		if (c.hasPlayerOwner)
			return true;
		// NPC combatants with "friendly" tokens are allies
		if (c.token?.disposition == 1)
			return true;
		
		// Everybody else is not an ally
		return false;
	}
	
	/**
	 * Add the "here be bad guys" text at the indicated position
	 * 
	 * @param DOMElement c  The element BEFORE which to insert the bad
	 *                      guy marker.
	 * @param bool after    Add the element AFTER instead
	 * @return void
	 */
	static hereBeBadGuys(c, after = false)
	{
		const divider = document.createElement('li');
		divider.classList.add('directory-item');
		divider.classList.add('flexrow');
		divider.classList.add('bracket-divider');
		divider.innerHTML = "... here be bad guys ...";
		c.parentNode.insertBefore(divider, (after ? c.nextSibling : c));
	}
}
