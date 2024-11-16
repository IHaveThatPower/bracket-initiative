import {
	BracketInitiative
} from './bracket.class.js';

/**
 * On initialization, patch the actor document and the Combatant
 * prototype's initiative formula.
 */
Hooks.once("init", function() {
	// Hook our rollAll callback
	libWrapper.register(BracketInitiative.MODULE_NAME, 'Combat.prototype.rollAll', function(wrapped, ...args) {
		const result = wrapped(...args);
		BracketInitiative.rollAllInitiativeCallback();
		return result;
	}, 'WRAPPER');
	libWrapper.register(BracketInitiative.MODULE_NAME, 'Combat.prototype.rollNPC', function(wrapped, ...args) {
		const result = wrapped(...args);
		BracketInitiative.rollAllInitiativeCallback();
		return result;
	}, 'WRAPPER');

	// Hook the D20Roll modifier 
	// Old pre-v4.1
	if (!!CONFIG.Dice.D20Roll.prototype._onDialogSubmit)
	{
		libWrapper.register(BracketInitiative.MODULE_NAME, 'CONFIG.Dice.D20Roll.prototype._onDialogSubmit', function(wrapped, html, advantageMode) {
			const roll = wrapped(html, advantageMode);
			const form = html[0].querySelector('form');
			const manualInput = form.querySelector('input[name=manual]');
			if (manualInput)
			{
				const explicitRoll = Number(manualInput.value);
				if (explicitRoll && !isNaN(explicitRoll))
				{
					return BracketInitiative.patchInitiative(roll);
				}
			}
			return roll;
		}, 'WRAPPER');
	}

	// Setup our debug property
	CONFIG.debug.BracketInitiative = false;
});

/**
 * Patch initiative rolling, v4.1+
 */
// Inject our manually-entered resulst as an option on the roll config
Hooks.on("dnd5e.buildRollConfig", function(dialog, config, formData) {
	if (!!config && !!formData)
	{
		const manualResult = Number(formData.object.manual);
		if (!isNaN(manualResult))
		{
			// TODO: Implement with flags?
			config.options.manualResult = manualResult;
		}
	}
});
// Patch the actual initiative roll before it gets rolled
Hooks.on("dnd5e.preRollInitiative", (actor, roll) => {
	roll = BracketInitiative.patchInitiativeRoll(roll);
});

/**
 * When the game environment is ready, if a combat is already active,
 * turn on our socket.
 */
Hooks.once("ready", function() {
	if (!game.modules.get('lib-wrapper')?.active && game.user.isGM)
		ui.notifications.error("Module BracketInitiative requires the 'libWrapper' module. Please install and activate it.");

	if (game.combats.active)
	{
		BracketInitiative.log("Active combat detected; activating BracketInitiative socket");
		game.socket.on(BracketInitiative.SOCKET_NAME, BracketInitiative.handleUpdate);
	}
});

/**
 * When a combat is created, activate our socket!
 */
Hooks.on("createCombat", () => {
	BracketInitiative.log("New combat detected; activating BracketInitiative socket");
	game.socket.on(BracketInitiative.SOCKET_NAME, BracketInitiative.handleUpdate);
});

/**
 * Turn our socket off when combat ends.
 */
Hooks.on("deleteCombat", () => {
	BracketInitiative.log("Dectivating BracketInitiative socket");
	game.socket.off(BracketInitiative.SOCKET_NAME);
});

/**
 * When various combat events occur -- start, round advance, turn
 * advance, pass that data to our class for handling
 */
Hooks.on("combatStart", (combat, round) => {
	BracketInitiative.handleCombatEvent("start", combat, round);
});
Hooks.on("combatTurn", (combat, round, time) => {
	BracketInitiative.handleCombatEvent("turn", combat, round, time);
});
Hooks.on("combatRound", (combat, round, time) => {
	BracketInitiative.handleCombatEvent("round", combat, round, time);
});
Hooks.on("updateCombatant", (combatant, update, diff, id) => {
	BracketInitiative.handleCombatantEvent(combatant, update);
});

/* Old pre-v4.1 */
Hooks.on("renderDialog", (dialog, $html, appData) => {
	BracketInitiative.enhanceLegacyInitiativeDialog(dialog, $html, appData);
});
/* New for v4.1 */
Hooks.on("renderD20RollConfigurationDialog", (roll, dialog) => {
	BracketInitiative.enhanceInitiativeDialog(roll, dialog);
});

Hooks.on("renderCombatTracker", (tracker, html, data) => {
	BracketInitiative.enhanceCombatTracker(html);
});