import { AlertCategory, ButtonVariant, ModalEnum } from '@genfeedai/enums';
import {
  hasFormErrors,
  parseFormErrors,
} from '@genfeedai/helpers/ui/form-error/form-error.helper';
import type { ModalBotProps } from '@genfeedai/props/modals/modal.props';
import Alert from '@ui/feedback/alert/Alert';
import ModalActions from '@ui/modals/actions/ModalActions';
import Modal from '@ui/modals/modal/Modal';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import FormControl from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import type { ChangeEvent } from 'react';
import { HiTrash } from 'react-icons/hi2';
import ModalBotChatSettings from './ModalBotChatSettings';
import ModalBotEngagementSettings from './ModalBotEngagementSettings';
import ModalBotMonitoringSettings from './ModalBotMonitoringSettings';
import ModalBotPublishingSettings from './ModalBotPublishingSettings';
import { BOT_CATEGORIES, BOT_PLATFORMS_LIST, useModalBot } from './useModalBot';

export default function ModalBot({ bot, onConfirm }: ModalBotProps) {
  const {
    form,
    formRef,
    isSubmitting,
    onSubmit,
    closeModal,
    deleteModalBot,
    processKeyDownModalBot,
    updateModalBot,
    handleCategoryChange,
    handlePlatformToggle,
    handleSettingChange,
    handleCategorySettingChange,
    handleArrayToggle,
    parseCommaSeparated,
    platforms,
    category,
    settings,
    engagementSettings,
    monitoringSettings,
    publishingSettings,
    selectedCategory,
    showChatCommentSettings,
    showEngagementSettings,
    showMonitoringSettings,
    showPublishingSettings,
  } = useModalBot({ bot, onConfirm });

  return (
    <Modal id={ModalEnum.BOT} title={bot ? 'Edit Bot' : 'Create Bot'}>
      <form ref={formRef} onSubmit={onSubmit}>
        {hasFormErrors(form.formState.errors) && (
          <Alert type={AlertCategory.ERROR} className="mb-4">
            <div className="space-y-1">
              {parseFormErrors(form.formState.errors).map((error) => (
                <div key={error}>{error}</div>
              ))}
            </div>
          </Alert>
        )}

        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
          {/* Basic Information */}
          <div className="space-y-4">
            <FormControl label="Bot Name">
              <Input
                type="text"
                name="label"
                control={form.control}
                onChange={updateModalBot}
                placeholder="Enter bot name"
                isRequired={true}
                isDisabled={isSubmitting}
              />
            </FormControl>

            <FormControl label="Description">
              <Textarea
                name="description"
                control={form.control}
                onChange={updateModalBot}
                placeholder="Enter description (optional)"
                isDisabled={isSubmitting}
                onKeyDown={processKeyDownModalBot}
              />
            </FormControl>

            <FormControl label="Bot Type">
              <Select
                value={category}
                onValueChange={(value) => {
                  handleCategoryChange({
                    target: { value },
                  } as ChangeEvent<HTMLSelectElement>);
                }}
                disabled={isSubmitting}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BOT_CATEGORIES.map(({ value, label, description }) => (
                    <SelectItem key={value} value={value}>
                      {label} - {description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormControl>

            {selectedCategory && (
              <div className="bg-background p-3 flex items-center gap-3">
                <selectedCategory.icon className="text-2xl text-primary" />
                <div>
                  <div className="font-medium">{selectedCategory.label}</div>
                  <div className="text-sm text-foreground/60">
                    {selectedCategory.description}
                  </div>
                </div>
              </div>
            )}

            <FormControl label="Platforms">
              <div className="flex flex-wrap gap-4">
                {BOT_PLATFORMS_LIST.map(
                  ({ platform, icon: Icon, color, label }) => (
                    <label
                      key={platform}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <Checkbox
                        isChecked={platforms.includes(platform)}
                        onCheckedChange={() => handlePlatformToggle(platform)}
                        isDisabled={isSubmitting}
                      />
                      <Icon className={color} />
                      <span className="text-sm">{label}</span>
                    </label>
                  ),
                )}
              </div>
            </FormControl>
          </div>

          <div className="h-px bg-border my-4" />

          {showChatCommentSettings && (
            <ModalBotChatSettings
              settings={settings}
              isSubmitting={isSubmitting}
              onSettingChange={handleSettingChange}
              onKeyDown={processKeyDownModalBot}
              parseCommaSeparated={parseCommaSeparated}
            />
          )}

          {showEngagementSettings && (
            <ModalBotEngagementSettings
              engagementSettings={engagementSettings}
              isSubmitting={isSubmitting}
              onArrayToggle={handleArrayToggle}
              onSettingChange={(field, value) =>
                handleCategorySettingChange('engagementSettings', field, value)
              }
              onKeyDown={processKeyDownModalBot}
              parseCommaSeparated={parseCommaSeparated}
            />
          )}

          {showMonitoringSettings && (
            <ModalBotMonitoringSettings
              monitoringSettings={monitoringSettings}
              isSubmitting={isSubmitting}
              onArrayToggle={handleArrayToggle}
              onSettingChange={(field, value) =>
                handleCategorySettingChange('monitoringSettings', field, value)
              }
              onKeyDown={processKeyDownModalBot}
              parseCommaSeparated={parseCommaSeparated}
            />
          )}

          {showPublishingSettings && (
            <ModalBotPublishingSettings
              publishingSettings={publishingSettings}
              isSubmitting={isSubmitting}
              onSettingChange={(field, value) =>
                handleCategorySettingChange('publishingSettings', field, value)
              }
              onKeyDown={processKeyDownModalBot}
              parseCommaSeparated={parseCommaSeparated}
            />
          )}
        </div>

        <ModalActions>
          <Button
            label="Cancel"
            variant={ButtonVariant.SECONDARY}
            onClick={() => closeModal()}
            isLoading={isSubmitting}
          />

          {bot && deleteModalBot && (
            <Button
              label={<HiTrash />}
              variant={ButtonVariant.DESTRUCTIVE}
              onClick={deleteModalBot}
              isLoading={isSubmitting}
            />
          )}

          <Button
            type="submit"
            label={bot ? 'Update' : 'Create'}
            variant={ButtonVariant.DEFAULT}
            isLoading={isSubmitting}
            isDisabled={isSubmitting || !form.formState.isValid}
          />
        </ModalActions>
      </form>
    </Modal>
  );
}
