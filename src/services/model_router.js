'use strict';

const MODELS = {
  HAIKU:  'claude-haiku-4-5-20251001',
  SONNET: 'claude-sonnet-4-6',
  OPUS:   'claude-opus-4-7',
};

function selectBriefModel(driverCount, sourceCount) {
  if (driverCount > 3 || sourceCount > 10) return MODELS.OPUS;
  return MODELS.SONNET;
}

function selectDeepDiveModel(reason = '', confidence = 70) {
  const isMacro = /macro|regulatory|systemic|fed|selic|ecb/i.test(reason);
  const isComplex = confidence < 60 || isMacro;
  return isComplex ? MODELS.OPUS : MODELS.SONNET;
}

module.exports = { MODELS, selectBriefModel, selectDeepDiveModel };
