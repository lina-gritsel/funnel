import { expect, test, type Page } from '@playwright/test'

async function expectVersion(page: Page, version: number, variant: 'A' | 'B') {
  await expect(page.getByRole('banner')).toContainText(`v${version} · вариант ${variant}`)
}

async function continueFunnel(page: Page, label: 'Начать' | 'Продолжить' = 'Продолжить') {
  await page.getByRole('button', { name: label, exact: true }).click()
}

async function selectSingleAndContinue(page: Page, label: string) {
  await page.getByRole('radio', { name: label }).check()
  await continueFunnel(page)
}

async function selectMultipleAndContinue(page: Page, label: string) {
  await page.getByRole('checkbox', { name: label }).check()
  await continueFunnel(page)
}

test('versioned A/B funnel survives refresh, publish and rollback', async ({ browser }) => {
  const visitorContext = await browser.newContext()
  const variantA = await visitorContext.newPage()
  const variantB = await visitorContext.newPage()

  await test.step('start v1 sessions in variants A and B', async () => {
    await variantA.goto('/?variant=A&utm_campaign=e2e-a')
    await expectVersion(variantA, 1, 'A')
    await expect(
      variantA.getByRole('heading', { name: 'Подберём подходящий финансовый сценарий' })
    ).toBeVisible()
    await continueFunnel(variantA, 'Начать')
    await selectSingleAndContinue(variantA, 'Начать инвестировать')
    await expect(
      variantA.getByRole('heading', { name: 'С какой суммой вы планируете работать?' })
    ).toBeVisible()
    await variantA.getByLabel('Сумма').fill('42000')

    const sessionBeforeRefresh = await variantA.evaluate("localStorage.getItem('funnel-session:A')")
    await variantA.reload()
    await expectVersion(variantA, 1, 'A')
    await expect(
      variantA.getByRole('heading', { name: 'С какой суммой вы планируете работать?' })
    ).toBeVisible()
    await expect(variantA.getByLabel('Сумма')).toHaveValue('42000')
    await expect
      .poll(() => variantA.evaluate("localStorage.getItem('funnel-session:A')"))
      .toBe(sessionBeforeRefresh)

    await variantA.getByLabel('Сумма').fill('50000')
    await continueFunnel(variantA)
    await expect(
      variantA.getByRole('heading', { name: 'Что для вас особенно важно?' })
    ).toBeVisible()
    await variantA.getByRole('button', { name: 'Назад' }).click()
    await expect(variantA.getByLabel('Сумма')).toHaveValue('50000')
    await continueFunnel(variantA)

    await variantB.goto('/?variant=B&utm_campaign=e2e-b')
    await expectVersion(variantB, 1, 'B')
    await expect(
      variantB.getByRole('heading', { name: 'Начнём с пары практических вопросов' })
    ).toBeVisible()
    await continueFunnel(variantB, 'Начать')
    await expect(
      variantB.getByRole('heading', { name: 'С какой суммой вы планируете работать?' })
    ).toBeVisible()
  })

  const adminContext = await browser.newContext()
  const admin = await adminContext.newPage()

  await test.step('authenticate and publish v2 through the admin UI', async () => {
    await admin.goto('/admin')
    await expect(admin.getByRole('heading', { name: 'Вход в админку' })).toBeVisible()
    await admin.getByLabel('Admin token').fill('e2e-admin-token')
    await admin.getByRole('button', { name: 'Войти' }).click()
    await expect(admin.getByRole('heading', { name: 'Подбор финансового сценария' })).toBeVisible()

    await expect(admin.getByRole('heading', { name: 'Как изменить воронку' })).toBeVisible()
    await expect(admin.getByRole('button', { name: 'Проверить конфигурацию' })).toBeDisabled()
    await expect(admin.getByRole('button', { name: 'Сохранить черновик' })).toBeDisabled()
    await expect(admin.getByRole('button', { name: 'Откатить версию' })).toBeDisabled()
    const downloadPromise = admin.waitForEvent('download')
    await admin.getByRole('button', { name: 'Скачать шаблон v2' }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe('funnel-v2.json')
    await admin.getByLabel('Новая конфигурация').setInputFiles({
      name: 'broken.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{broken')
    })
    await admin.getByRole('button', { name: 'Проверить конфигурацию' }).click()
    await expect(admin.getByRole('alert')).toContainText('Не удалось прочитать JSON')
    await expect(admin.getByRole('button', { name: 'Сохранить черновик' })).toBeDisabled()

    await admin.getByLabel('Новая конфигурация').setInputFiles('configs/funnel-v2.json')
    await expect(admin.getByRole('alert')).toHaveCount(0)
    await admin.getByRole('button', { name: 'Проверить конфигурацию' }).click()
    await expect(admin.getByText(/Проверка пройдена:/)).toBeVisible()
    await admin.getByLabel('Новая конфигурация').setInputFiles('configs/funnel-v1.json')
    await expect(admin.getByRole('button', { name: 'Сохранить черновик' })).toBeDisabled()
    await expect(admin.getByText(/Проверка пройдена:/)).toHaveCount(0)
    await admin.getByRole('button', { name: 'Проверить конфигурацию' }).click()
    await expect(admin.getByRole('alert')).toContainText('Следующая версия — v2')
    await admin.getByLabel('Новая конфигурация').setInputFiles('configs/funnel-v2.json')
    await admin.getByRole('button', { name: 'Проверить конфигурацию' }).click()
    await expect(admin.getByText(/Проверка пройдена:/)).toBeVisible()
    await admin.getByRole('button', { name: 'Сохранить черновик' }).click()
    await expect(admin.getByRole('button', { name: 'Опубликовать v2', exact: true })).toBeVisible()
    await expect(admin.getByRole('status')).toContainText('На сайте пока ничего не изменилось')
    await admin.getByRole('button', { name: 'Опубликовать v2', exact: true }).click()
    await admin.getByRole('button', { name: 'Отмена', exact: true }).click()
    await expect(admin.getByRole('region', { name: 'Подтверждение изменения версии' })).toHaveCount(
      0
    )
    await expect(
      admin.getByRole('heading', { name: 'Подбор финансового сценария', exact: true })
    ).toBeVisible()
    await admin.getByRole('button', { name: 'Опубликовать v2', exact: true }).click()
    await admin.getByRole('button', { name: 'Подтвердить публикацию' }).click()
    await expect(
      admin.getByRole('heading', {
        name: 'Подбор финансового сценария — горизонт планирования'
      })
    ).toBeVisible()
  })

  await test.step('finish both existing sessions on their pinned v1 routes', async () => {
    await expectVersion(variantA, 1, 'A')
    await selectMultipleAndContinue(variantA, 'Быстрый старт')
    await selectSingleAndContinue(variantA, 'Только начинаю')
    await expect(variantA.getByRole('heading', { name: 'Начнём с понятной основы' })).toBeVisible()
    await continueFunnel(variantA)
    await expect(variantA.getByRole('heading', { name: 'Рекомендация готова' })).toBeVisible()

    await expectVersion(variantB, 1, 'B')
    await variantB.getByLabel('Сумма').fill('75000')
    await continueFunnel(variantB)
    await selectSingleAndContinue(variantB, 'Создать накопления')
    await selectMultipleAndContinue(variantB, 'Помощь специалиста')
    await selectSingleAndContinue(variantB, 'Уже есть опыт')
    await expect(
      variantB.getByRole('heading', { name: 'Ваш персональный маршрут готов' })
    ).toBeVisible()
  })

  await test.step('assign new sessions to v2 and expose its new branch', async () => {
    const v2Context = await browser.newContext()
    const v2Visitor = await v2Context.newPage()
    await v2Visitor.goto('/?variant=B&utm_campaign=e2e-v2')
    await expectVersion(v2Visitor, 2, 'B')
    await expect(
      v2Visitor.getByRole('heading', { name: 'Соберём ваш финансовый маршрут' })
    ).toBeVisible()
    await continueFunnel(v2Visitor, 'Начать')
    await v2Visitor.getByLabel('Сумма').fill('100000')
    await continueFunnel(v2Visitor)
    await selectSingleAndContinue(v2Visitor, 'Начать инвестировать')
    await selectMultipleAndContinue(v2Visitor, 'Быстрый старт')
    await expect(
      v2Visitor.getByRole('heading', { name: 'Когда вам могут понадобиться эти деньги?' })
    ).toBeVisible()
    await v2Context.close()
  })

  await test.step('rollback to v1 and use it for the next session', async () => {
    await admin.getByRole('button', { name: 'Откатить версию' }).click()
    await expect(
      admin.getByRole('region', { name: 'Подтверждение изменения версии' })
    ).toContainText('Вернуть на сайт версию v1?')
    await admin.getByRole('button', { name: 'Подтвердить откат' }).click()
    await expect(admin.getByRole('heading', { name: 'Подбор финансового сценария' })).toBeVisible()

    const rollbackContext = await browser.newContext()
    const rollbackVisitor = await rollbackContext.newPage()
    await rollbackVisitor.goto('/?variant=A&utm_campaign=e2e-rollback')
    await expectVersion(rollbackVisitor, 1, 'A')
    await expect(
      rollbackVisitor.getByRole('heading', { name: 'Подберём подходящий финансовый сценарий' })
    ).toBeVisible()
    await rollbackContext.close()

    await admin.getByRole('button', { name: 'Выйти' }).click()
    await expect(admin.getByRole('heading', { name: 'Вход в админку' })).toBeVisible()
  })

  await adminContext.close()
  await visitorContext.close()
})
