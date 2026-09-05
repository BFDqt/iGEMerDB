import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Layout } from './Layout';

function renderLayout() {
  return render(
    <MemoryRouter
      future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
    >
      <Layout>
        <button type="button">页面操作</button>
      </Layout>
    </MemoryRouter>,
  );
}

describe('global search dialog', () => {
  it('exposes modal semantics, traps focus, and restores the trigger', async () => {
    const user = userEvent.setup();
    renderLayout();
    const trigger = screen.getByRole('button', { name: /全站检索/ });

    await user.click(trigger);
    const dialog = screen.getByRole('dialog', { name: '全站检索' });
    const input = screen.getByRole('textbox', {
      name: '检索队伍、成员或机构',
    });
    const closeButton = screen.getByRole('button', { name: '关闭检索' });

    expect(dialog).toHaveAttribute('aria-modal', 'true');
    await waitFor(() => expect(input).toHaveFocus());

    closeButton.focus();
    await user.tab();
    expect(input).toHaveFocus();

    await user.tab({ shift: true });
    expect(closeButton).toHaveFocus();

    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('opens from the platform-neutral Control shortcut', async () => {
    const user = userEvent.setup();
    renderLayout();

    await user.keyboard('{Control>}k{/Control}');
    expect(screen.getByRole('dialog', { name: '全站检索' })).toHaveAttribute(
      'open',
    );
  });
});
