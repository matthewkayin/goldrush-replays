# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview
This repo is for a site called Gold Rush Replays, a replay site for the real-time strategy game Gold Rush. This site should allow players of the game to upload a replay file and, within moments, see a match page that breaks down how they and their opponents played: economy, army, build order, upgrades, APM, and fights.

This is a side project. It is built to run on a developer laptop. Production hosting is not a goal.

A detailed overview of the project can be found in `docs/project.md`.

## Write Maintainable Code
As an agent, your job is to create good software. Good software is software that is maintainable. Notions of code quality like "cleanliness" or "elegance" are well-intentioned but aesthetic. They are not grounded in any reasoning.

Writing maintainable code means understanding that humans and agents will be editing this repo in the future. This means:
 - Prefer simple solutions and code
  - That said, sometimes complexity is necessary. Prefer simple solutions, but use complexity as needed
 - Writing code that reads like plain English and is self-documenting
 - Writing tests whose primary purpose is not to verify behavior but to safeguard against regression (allowing code authors to make changes confidently knowing that the tests have their back)
 - Writing and maintaining consistent documentation that allows humans and agents to understand the codebase
