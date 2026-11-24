export async function setMultiSelectFilter(evaluate, label, selectedLabel = '') {
  const selector = `summary[aria-label=${JSON.stringify(label)}]`
  const checkedLabels = await evaluate(`(() => {
    const summary = document.querySelector(${JSON.stringify(selector)})
    if (!summary) throw new Error('Missing filter: ' + ${JSON.stringify(label)})
    return [...summary.closest('details').querySelectorAll('label')]
      .filter(option => option.querySelector('input').checked)
      .map(option => option.textContent.trim())
  })()`)

  for (const option of checkedLabels) {
    if (option === selectedLabel) continue
    await toggleFilterOption(evaluate, selector, option)
  }
  if (selectedLabel && !checkedLabels.includes(selectedLabel)) {
    await toggleFilterOption(evaluate, selector, selectedLabel)
  }
}

async function toggleFilterOption(evaluate, selector, optionText) {
  await evaluate(`(() => {
    const summary = document.querySelector(${JSON.stringify(selector)})
    const details = summary.closest('details')
    details.open = true
    const option = [...details.querySelectorAll('label')]
      .find(item => item.textContent.trim() === ${JSON.stringify(optionText)})
    if (!option) throw new Error('Missing filter option: ' + ${JSON.stringify(optionText)})
    option.querySelector('input').click()
    details.open = false
  })()`)
  await new Promise((resolve) => setTimeout(resolve, 30))
}
