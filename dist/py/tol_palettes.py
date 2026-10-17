"""
Paul Tol colour schemes — generated from data/schemes/*.json by tools/generate-py.mjs.
Do not edit by hand.

Sources:
- Paul Tol's Notes: https://sronpersonalpages.nl/~pault/
- Official Python module tol_colors.py (version 2022.10):
  https://sronpersonalpages.nl/~pault/data/tol_colors.py

Independent project: not affiliated with or endorsed by Paul Tol.
Policy: colour values only; colour names are present only where tol_colors.py provides them.

3-Clause BSD Notice for values and colormap structure derived from tol_colors.py:
Copyright (c) 2022, Paul Tol. All rights reserved.

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:
1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.
3. Neither the name of the copyright holder nor the names of its contributors
   may be used to endorse or promote products derived from this software without
   specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
"""

from collections import namedtuple

__all__ = [
    'SCHEMES',
    'OFFICIAL_CSET_NAMES',
    'CSET_NAMES',
    'OFFICIAL_CMAP_NAMES',
    'CMAP_NAMES',
    'tol_cset',
    'tol_cmap_colors',
    'tol_cmap',
    'discretemap',
]

SCHEMES = {
    'banded-12': {
        'id': 'banded-12',
        'kind': 'sequential',
        'colors': ('#D2D1E2', '#C1A7C4', '#AD7BA4', '#93C7EC', '#6DA1D6', '#3E79BD', '#B8D29E', '#7BB47D', '#2C925B', '#F4A937', '#EB7121', '#D9070D'),
        'bad': '#FFFFFF',
        'interpolation': 'none',
    },
    'banded-16': {
        'id': 'banded-16',
        'kind': 'sequential',
        'colors': (
            '#D2D1E2',
            '#C5B3CC',
            '#B893B5',
            '#A8719D',
            '#97CDEF',
            '#7DB1DF',
            '#5F94CE',
            '#3976BB',
            '#BCD4A0',
            '#90BE88',
            '#60A770',
            '#198D56',
            '#F5B43B',
            '#F08C2B',
            '#E85E1B',
            '#D9070D',
        ),
        'bad': '#FFFFFF',
        'interpolation': 'none',
    },
    'banded-20': {
        'id': 'banded-20',
        'kind': 'sequential',
        'colors': (
            '#D2D1E2',
            '#C8B9D1',
            '#BEA0BF',
            '#B287AD',
            '#A56B99',
            '#9ACFF1',
            '#85BAE4',
            '#6FA3D7',
            '#578DC9',
            '#3774BA',
            '#BFD6A1',
            '#9CC48E',
            '#78B27B',
            '#4F9F68',
            '#058A53',
            '#F6B93D',
            '#F29B31',
            '#ED7A24',
            '#E65318',
            '#D9070D',
        ),
        'bad': '#FFFFFF',
        'interpolation': 'none',
    },
    'bright': {
        'id': 'bright',
        'kind': 'qualitative',
        'colors': ('#4477AA', '#EE6677', '#228833', '#CCBB44', '#66CCEE', '#AA3377', '#BBBBBB'),
        'extras': ('#000000',),
        'interpolation': 'none',
    },
    'burd': {
        'id': 'burd',
        'kind': 'diverging',
        'colors': ('#2166AC', '#4393C3', '#92C5DE', '#D1E5F0', '#F7F7F7', '#FDDBC7', '#F4A582', '#D6604D', '#B2182B'),
        'bad': '#FFEE99',
        'interpolation': 'either',
    },
    'dark': {
        'id': 'dark',
        'kind': 'qualitative',
        'colors': ('#4477BB', '#CC4466', '#228833', '#2255AA', '#993366', '#006644', '#117788', '#882288', '#BB4488', '#775500', '#444444'),
        'interpolation': 'none',
    },
    'groundcover': {
        'id': 'groundcover',
        'kind': 'special',
        'colors': (
            '#5566AA',
            '#117733',
            '#44AA66',
            '#55AA22',
            '#668822',
            '#99BB55',
            '#558877',
            '#88BBAA',
            '#AADDCC',
            '#44AA88',
            '#DDCC66',
            '#FFDD44',
            '#FFEE88',
            '#BB0011',
        ),
        'interpolation': 'none',
    },
    'high-contrast': {
        'id': 'high-contrast',
        'kind': 'qualitative',
        'colors': ('#004488', '#DDAA33', '#BB5566'),
        'extras': ('#000000',),
        'interpolation': 'none',
    },
    'incandescent': {
        'id': 'incandescent',
        'kind': 'sequential',
        'colors': ('#CEFFFF', '#C6F7D6', '#A2F49B', '#BBE453', '#D5CE04', '#E7B503', '#F19903', '#F6790B', '#F94902', '#E40515', '#A80003'),
        'bad': '#888888',
        'interpolation': 'linear',
    },
    'iridescent': {
        'id': 'iridescent',
        'kind': 'sequential',
        'colors': (
            '#FEFBE9',
            '#FCF7D5',
            '#F5F3C1',
            '#EAF0B5',
            '#DDECBF',
            '#D0E7CA',
            '#C2E3D2',
            '#B5DDD8',
            '#A8D8DC',
            '#9BD2E1',
            '#8DCBE4',
            '#81C4E7',
            '#7BBCE7',
            '#7EB2E4',
            '#88A5DD',
            '#9398D2',
            '#9B8AC4',
            '#9D7DB2',
            '#9A709E',
            '#906388',
            '#805770',
            '#684957',
            '#46353A',
        ),
        'bad': '#999999',
        'interpolation': 'linear',
    },
    'light': {
        'id': 'light',
        'kind': 'qualitative',
        'colors': ('#77AADD', '#EE8866', '#EEDD88', '#FFAABB', '#99DDFF', '#44BB99', '#BBCC33', '#AAAA00', '#DDDDDD'),
        'extras': ('#000000',),
        'interpolation': 'none',
    },
    'medium-contrast': {
        'id': 'medium-contrast',
        'kind': 'qualitative',
        'colors': ('#6699CC', '#004488', '#EECC66', '#994455', '#997700', '#EE99AA'),
        'extras': ('#000000',),
        'interpolation': 'none',
    },
    'muted': {
        'id': 'muted',
        'kind': 'qualitative',
        'colors': ('#CC6677', '#332288', '#DDCC77', '#117733', '#88CCEE', '#882255', '#44AA99', '#999933', '#AA4499'),
        'extras': ('#DDDDDD', '#000000'),
        'bad': '#DDDDDD',
        'interpolation': 'none',
    },
    'nightfall': {
        'id': 'nightfall',
        'kind': 'diverging',
        'colors': (
            '#125A56',
            '#00767B',
            '#238F9D',
            '#42A7C6',
            '#60BCE9',
            '#9DCCEF',
            '#C6DBED',
            '#DEE6E7',
            '#ECEADA',
            '#F0E6B2',
            '#F9D576',
            '#FFB954',
            '#FD9A44',
            '#F57634',
            '#E94C1F',
            '#D11807',
            '#A01813',
        ),
        'bad': '#FFFFFF',
        'interpolation': 'either',
    },
    'pale': {
        'id': 'pale',
        'kind': 'qualitative',
        'colors': ('#AACCEE', '#CCEEFF', '#BBDDBB', '#EEEEBB', '#FFBBCC', '#EEBBDD', '#DDDDDD'),
        'interpolation': 'none',
    },
    'prgn': {
        'id': 'prgn',
        'kind': 'diverging',
        'colors': ('#762A83', '#9970AB', '#C2A5CF', '#E7D4E8', '#F7F7F7', '#D9F0D3', '#ACD39E', '#5AAE61', '#1B7837'),
        'bad': '#FFEE99',
        'interpolation': 'either',
    },
    'rainbow-discrete': {
        'id': 'rainbow-discrete',
        'kind': 'sequential',
        'colors': (
            '#E8ECFB',
            '#D9CCE3',
            '#D1BBD7',
            '#CAACCB',
            '#BA8DB4',
            '#AE76A3',
            '#AA6F9E',
            '#994F88',
            '#882E72',
            '#1965B0',
            '#437DBF',
            '#5289C7',
            '#6195CF',
            '#7BAFDE',
            '#4EB265',
            '#90C987',
            '#CAE0AB',
            '#F7F056',
            '#F7CB45',
            '#F6C141',
            '#F4A736',
            '#F1932D',
            '#EE8026',
            '#E8601C',
            '#E65518',
            '#DC050C',
            '#A5170E',
            '#72190E',
            '#42150A',
        ),
        'bad': '#FFFFFF',
        'interpolation': 'none',
    },
    'rainbow-smooth': {
        'id': 'rainbow-smooth',
        'kind': 'sequential',
        'colors': (
            '#E8ECFB',
            '#DDD8EF',
            '#D1C1E1',
            '#C3A8D1',
            '#B58FC2',
            '#A778B4',
            '#9B62A7',
            '#8C4E99',
            '#6F4C9B',
            '#6059A9',
            '#5568B8',
            '#4E79C5',
            '#4D8AC6',
            '#4E96BC',
            '#549EB3',
            '#59A5A9',
            '#60AB9E',
            '#69B190',
            '#77B77D',
            '#8CBC68',
            '#A6BE54',
            '#BEBC48',
            '#D1B541',
            '#DDAA3C',
            '#E49C39',
            '#E78C35',
            '#E67932',
            '#E4632D',
            '#DF4828',
            '#DA2222',
            '#B8221E',
            '#95211B',
            '#721E17',
            '#521A13',
        ),
        'bad': '#666666',
        'interpolation': 'linear',
    },
    'sunset': {
        'id': 'sunset',
        'kind': 'diverging',
        'colors': ('#364B9A', '#4A7BB7', '#6EA6CD', '#98CAE1', '#C2E4EF', '#EAECCC', '#FEDA8B', '#FDB366', '#F67E4B', '#DD3D2D', '#A50026'),
        'bad': '#FFFFFF',
        'interpolation': 'either',
    },
    'vibrant': {
        'id': 'vibrant',
        'kind': 'qualitative',
        'colors': ('#EE7733', '#0077BB', '#33BBEE', '#EE3377', '#CC3311', '#009988', '#BBBBBB'),
        'extras': ('#000000',),
        'interpolation': 'none',
    },
    'whorbr': {
        'id': 'whorbr',
        'kind': 'sequential',
        'colors': ('#FFFFFF', '#FFF7BC', '#FEE391', '#FEC44F', '#FB9A29', '#EC7014', '#CC4C02', '#993404', '#662506'),
        'bad': '#888888',
        'interpolation': 'linear',
    },
    'ylorbr': {
        'id': 'ylorbr',
        'kind': 'sequential',
        'colors': ('#FFFFE5', '#FFF7BC', '#FEE391', '#FEC44F', '#FB9A29', '#EC7014', '#CC4C02', '#993404', '#662506'),
        'bad': '#888888',
        'interpolation': 'either',
    },
}

OFFICIAL_CSET_NAMES = ('bright', 'high-contrast', 'vibrant', 'muted', 'medium-contrast', 'light')

CSET_NAMES = ('bright', 'high-contrast', 'vibrant', 'muted', 'medium-contrast', 'light', 'dark', 'pale', 'groundcover')

_NAMED_CSETS = {
    'bright': {
        'fields': ('blue', 'red', 'green', 'yellow', 'cyan', 'purple', 'grey', 'black'),
        'hex': ('#4477AA', '#EE6677', '#228833', '#CCBB44', '#66CCEE', '#AA3377', '#BBBBBB', '#000000'),
    },
    'high-contrast': {
        'fields': ('blue', 'yellow', 'red', 'black'),
        'hex': ('#004488', '#DDAA33', '#BB5566', '#000000'),
    },
    'vibrant': {
        'fields': ('orange', 'blue', 'cyan', 'magenta', 'red', 'teal', 'grey', 'black'),
        'hex': ('#EE7733', '#0077BB', '#33BBEE', '#EE3377', '#CC3311', '#009988', '#BBBBBB', '#000000'),
    },
    'muted': {
        'fields': ('rose', 'indigo', 'sand', 'green', 'cyan', 'wine', 'teal', 'olive', 'purple', 'pale_grey', 'black'),
        'hex': ('#CC6677', '#332288', '#DDCC77', '#117733', '#88CCEE', '#882255', '#44AA99', '#999933', '#AA4499', '#DDDDDD', '#000000'),
    },
    'medium-contrast': {
        'fields': ('light_blue', 'dark_blue', 'light_yellow', 'dark_red', 'dark_yellow', 'light_red', 'black'),
        'hex': ('#6699CC', '#004488', '#EECC66', '#994455', '#997700', '#EE99AA', '#000000'),
    },
    'light': {
        'fields': ('light_blue', 'orange', 'light_yellow', 'pink', 'light_cyan', 'mint', 'pear', 'olive', 'pale_grey', 'black'),
        'hex': ('#77AADD', '#EE8866', '#EEDD88', '#FFAABB', '#99DDFF', '#44BB99', '#BBCC33', '#AAAA00', '#DDDDDD', '#000000'),
    },
}

_UNNAMED_CSETS = {
    'dark': ('#4477BB', '#CC4466', '#228833', '#2255AA', '#993366', '#006644', '#117788', '#882288', '#BB4488', '#775500', '#444444'),
    'pale': ('#AACCEE', '#CCEEFF', '#BBDDBB', '#EEEEBB', '#FFBBCC', '#EEBBDD', '#DDDDDD'),
    'groundcover': (
        '#5566AA',
        '#117733',
        '#44AA66',
        '#55AA22',
        '#668822',
        '#99BB55',
        '#558877',
        '#88BBAA',
        '#AADDCC',
        '#44AA88',
        '#DDCC66',
        '#FFDD44',
        '#FFEE88',
        '#BB0011',
    ),
}

OFFICIAL_CMAP_NAMES = (
    'sunset_discrete', 'sunset', 'nightfall_discrete', 'nightfall',
    'BuRd_discrete', 'BuRd', 'PRGn_discrete', 'PRGn',
    'YlOrBr_discrete', 'YlOrBr', 'WhOrBr', 'iridescent',
    'rainbow_PuRd', 'rainbow_PuBr', 'rainbow_WhRd', 'rainbow_WhBr',
    'rainbow_discrete',
)

_CMAPS = {
    'sunset_discrete': {
        'colors': ('#364B9A', '#4A7BB7', '#6EA6CD', '#98CAE1', '#C2E4EF', '#EAECCC', '#FEDA8B', '#FDB366', '#F67E4B', '#DD3D2D', '#A50026'),
        'bad': '#FFFFFF',
        'mode': 'discrete',
    },
    'sunset': {
        'colors': ('#364B9A', '#4A7BB7', '#6EA6CD', '#98CAE1', '#C2E4EF', '#EAECCC', '#FEDA8B', '#FDB366', '#F67E4B', '#DD3D2D', '#A50026'),
        'bad': '#FFFFFF',
        'mode': 'linear',
    },
    'nightfall_discrete': {
        'colors': ('#125A56', '#238F9D', '#60BCE9', '#C6DBED', '#ECEADA', '#F9D576', '#FD9A44', '#E94C1F', '#A01813'),
        'bad': '#FFFFFF',
        'mode': 'discrete',
    },
    'nightfall': {
        'colors': (
            '#125A56',
            '#00767B',
            '#238F9D',
            '#42A7C6',
            '#60BCE9',
            '#9DCCEF',
            '#C6DBED',
            '#DEE6E7',
            '#ECEADA',
            '#F0E6B2',
            '#F9D576',
            '#FFB954',
            '#FD9A44',
            '#F57634',
            '#E94C1F',
            '#D11807',
            '#A01813',
        ),
        'bad': '#FFFFFF',
        'mode': 'linear',
    },
    'BuRd_discrete': {
        'colors': ('#2166AC', '#4393C3', '#92C5DE', '#D1E5F0', '#F7F7F7', '#FDDBC7', '#F4A582', '#D6604D', '#B2182B'),
        'bad': '#FFEE99',
        'mode': 'discrete',
    },
    'BuRd': {
        'colors': ('#2166AC', '#4393C3', '#92C5DE', '#D1E5F0', '#F7F7F7', '#FDDBC7', '#F4A582', '#D6604D', '#B2182B'),
        'bad': '#FFEE99',
        'mode': 'linear',
    },
    'PRGn_discrete': {
        'colors': ('#762A83', '#9970AB', '#C2A5CF', '#E7D4E8', '#F7F7F7', '#D9F0D3', '#ACD39E', '#5AAE61', '#1B7837'),
        'bad': '#FFEE99',
        'mode': 'discrete',
    },
    'PRGn': {
        'colors': ('#762A83', '#9970AB', '#C2A5CF', '#E7D4E8', '#F7F7F7', '#D9F0D3', '#ACD39E', '#5AAE61', '#1B7837'),
        'bad': '#FFEE99',
        'mode': 'linear',
    },
    'YlOrBr_discrete': {
        'colors': ('#FFFFE5', '#FFF7BC', '#FEE391', '#FEC44F', '#FB9A29', '#EC7014', '#CC4C02', '#993404', '#662506'),
        'bad': '#888888',
        'mode': 'discrete',
    },
    'YlOrBr': {
        'colors': ('#FFFFE5', '#FFF7BC', '#FEE391', '#FEC44F', '#FB9A29', '#EC7014', '#CC4C02', '#993404', '#662506'),
        'bad': '#888888',
        'mode': 'linear',
    },
    'WhOrBr': {
        'colors': ('#FFFFFF', '#FFF7BC', '#FEE391', '#FEC44F', '#FB9A29', '#EC7014', '#CC4C02', '#993404', '#662506'),
        'bad': '#888888',
        'mode': 'linear',
    },
    'iridescent': {
        'colors': (
            '#FEFBE9',
            '#FCF7D5',
            '#F5F3C1',
            '#EAF0B5',
            '#DDECBF',
            '#D0E7CA',
            '#C2E3D2',
            '#B5DDD8',
            '#A8D8DC',
            '#9BD2E1',
            '#8DCBE4',
            '#81C4E7',
            '#7BBCE7',
            '#7EB2E4',
            '#88A5DD',
            '#9398D2',
            '#9B8AC4',
            '#9D7DB2',
            '#9A709E',
            '#906388',
            '#805770',
            '#684957',
            '#46353A',
        ),
        'bad': '#999999',
        'mode': 'linear',
    },
    'rainbow_WhRd': {
        'colors': (
            '#E8ECFB',
            '#DDD8EF',
            '#D1C1E1',
            '#C3A8D1',
            '#B58FC2',
            '#A778B4',
            '#9B62A7',
            '#8C4E99',
            '#6F4C9B',
            '#6059A9',
            '#5568B8',
            '#4E79C5',
            '#4D8AC6',
            '#4E96BC',
            '#549EB3',
            '#59A5A9',
            '#60AB9E',
            '#69B190',
            '#77B77D',
            '#8CBC68',
            '#A6BE54',
            '#BEBC48',
            '#D1B541',
            '#DDAA3C',
            '#E49C39',
            '#E78C35',
            '#E67932',
            '#E4632D',
            '#DF4828',
            '#DA2222',
        ),
        'bad': '#666666',
        'mode': 'linear',
    },
    'rainbow_WhBr': {
        'colors': (
            '#E8ECFB',
            '#DDD8EF',
            '#D1C1E1',
            '#C3A8D1',
            '#B58FC2',
            '#A778B4',
            '#9B62A7',
            '#8C4E99',
            '#6F4C9B',
            '#6059A9',
            '#5568B8',
            '#4E79C5',
            '#4D8AC6',
            '#4E96BC',
            '#549EB3',
            '#59A5A9',
            '#60AB9E',
            '#69B190',
            '#77B77D',
            '#8CBC68',
            '#A6BE54',
            '#BEBC48',
            '#D1B541',
            '#DDAA3C',
            '#E49C39',
            '#E78C35',
            '#E67932',
            '#E4632D',
            '#DF4828',
            '#DA2222',
            '#B8221E',
            '#95211B',
            '#721E17',
            '#521A13',
        ),
        'bad': '#666666',
        'mode': 'linear',
    },
    'rainbow_PuRd': {
        'colors': (
            '#6F4C9B',
            '#6059A9',
            '#5568B8',
            '#4E79C5',
            '#4D8AC6',
            '#4E96BC',
            '#549EB3',
            '#59A5A9',
            '#60AB9E',
            '#69B190',
            '#77B77D',
            '#8CBC68',
            '#A6BE54',
            '#BEBC48',
            '#D1B541',
            '#DDAA3C',
            '#E49C39',
            '#E78C35',
            '#E67932',
            '#E4632D',
            '#DF4828',
            '#DA2222',
        ),
        'bad': '#FFFFFF',
        'mode': 'linear',
    },
    'rainbow_PuBr': {
        'colors': (
            '#6F4C9B',
            '#6059A9',
            '#5568B8',
            '#4E79C5',
            '#4D8AC6',
            '#4E96BC',
            '#549EB3',
            '#59A5A9',
            '#60AB9E',
            '#69B190',
            '#77B77D',
            '#8CBC68',
            '#A6BE54',
            '#BEBC48',
            '#D1B541',
            '#DDAA3C',
            '#E49C39',
            '#E78C35',
            '#E67932',
            '#E4632D',
            '#DF4828',
            '#DA2222',
            '#B8221E',
            '#95211B',
            '#721E17',
            '#521A13',
        ),
        'bad': '#FFFFFF',
        'mode': 'linear',
    },
    'incandescent': {
        'colors': ('#CEFFFF', '#C6F7D6', '#A2F49B', '#BBE453', '#D5CE04', '#E7B503', '#F19903', '#F6790B', '#F94902', '#E40515', '#A80003'),
        'bad': '#888888',
        'mode': 'linear',
    },
    'incandescent_discrete': {
        'colors': ('#CEFFFF', '#C6F7D6', '#A2F49B', '#BBE453', '#D5CE04', '#E7B503', '#F19903', '#F6790B', '#F94902', '#E40515', '#A80003'),
        'bad': '#888888',
        'mode': 'discrete',
    },
    'banded_12': {
        'colors': ('#D2D1E2', '#C1A7C4', '#AD7BA4', '#93C7EC', '#6DA1D6', '#3E79BD', '#B8D29E', '#7BB47D', '#2C925B', '#F4A937', '#EB7121', '#D9070D'),
        'bad': '#FFFFFF',
        'mode': 'discrete',
    },
    'banded_16': {
        'colors': (
            '#D2D1E2',
            '#C5B3CC',
            '#B893B5',
            '#A8719D',
            '#97CDEF',
            '#7DB1DF',
            '#5F94CE',
            '#3976BB',
            '#BCD4A0',
            '#90BE88',
            '#60A770',
            '#198D56',
            '#F5B43B',
            '#F08C2B',
            '#E85E1B',
            '#D9070D',
        ),
        'bad': '#FFFFFF',
        'mode': 'discrete',
    },
    'banded_20': {
        'colors': (
            '#D2D1E2',
            '#C8B9D1',
            '#BEA0BF',
            '#B287AD',
            '#A56B99',
            '#9ACFF1',
            '#85BAE4',
            '#6FA3D7',
            '#578DC9',
            '#3774BA',
            '#BFD6A1',
            '#9CC48E',
            '#78B27B',
            '#4F9F68',
            '#058A53',
            '#F6B93D',
            '#F29B31',
            '#ED7A24',
            '#E65318',
            '#D9070D',
        ),
        'bad': '#FFFFFF',
        'mode': 'discrete',
    },
}

_RAINBOW_DISCRETE_COLORS = (
    '#E8ECFB',
    '#D9CCE3',
    '#D1BBD7',
    '#CAACCB',
    '#BA8DB4',
    '#AE76A3',
    '#AA6F9E',
    '#994F88',
    '#882E72',
    '#1965B0',
    '#437DBF',
    '#5289C7',
    '#6195CF',
    '#7BAFDE',
    '#4EB265',
    '#90C987',
    '#CAE0AB',
    '#F7F056',
    '#F7CB45',
    '#F6C141',
    '#F4A736',
    '#F1932D',
    '#EE8026',
    '#E8601C',
    '#E65518',
    '#DC050C',
    '#A5170E',
    '#72190E',
    '#42150A',
)

_RAINBOW_DISCRETE_LUT = (
    (9,),
    (9, 25),
    (9, 17, 25),
    (9, 14, 17, 25),
    (9, 13, 14, 17, 25),
    (9, 13, 14, 16, 17, 25),
    (8, 9, 13, 14, 16, 17, 25),
    (8, 9, 13, 14, 16, 17, 22, 25),
    (8, 9, 13, 14, 16, 17, 22, 25, 27),
    (8, 9, 13, 14, 16, 17, 20, 23, 25, 27),
    (8, 9, 11, 13, 14, 16, 17, 20, 23, 25, 27),
    (2, 5, 8, 9, 11, 13, 14, 16, 17, 20, 23, 25),
    (
        2,
        5,
        8,
        9,
        11,
        13,
        14,
        15,
        16,
        17,
        20,
        23,
        25,
    ),
    (
        2,
        5,
        8,
        9,
        11,
        13,
        14,
        15,
        16,
        17,
        19,
        21,
        23,
        25,
    ),
    (
        2,
        5,
        8,
        9,
        11,
        13,
        14,
        15,
        16,
        17,
        19,
        21,
        23,
        25,
        27,
    ),
    (
        2,
        4,
        6,
        8,
        9,
        11,
        13,
        14,
        15,
        16,
        17,
        19,
        21,
        23,
        25,
        27,
    ),
    (
        2,
        4,
        6,
        7,
        8,
        9,
        11,
        13,
        14,
        15,
        16,
        17,
        19,
        21,
        23,
        25,
        27,
    ),
    (
        2,
        4,
        6,
        7,
        8,
        9,
        11,
        13,
        14,
        15,
        16,
        17,
        19,
        21,
        23,
        25,
        26,
        27,
    ),
    (
        1,
        3,
        4,
        6,
        7,
        8,
        9,
        11,
        13,
        14,
        15,
        16,
        17,
        19,
        21,
        23,
        25,
        26,
        27,
    ),
    (
        1,
        3,
        4,
        6,
        7,
        8,
        9,
        10,
        12,
        13,
        14,
        15,
        16,
        17,
        19,
        21,
        23,
        25,
        26,
        27,
    ),
    (
        1,
        3,
        4,
        6,
        7,
        8,
        9,
        10,
        12,
        13,
        14,
        15,
        16,
        17,
        18,
        20,
        22,
        24,
        25,
        26,
        27,
    ),
    (
        1,
        3,
        4,
        6,
        7,
        8,
        9,
        10,
        12,
        13,
        14,
        15,
        16,
        17,
        18,
        20,
        22,
        24,
        25,
        26,
        27,
        28,
    ),
    (
        0,
        1,
        3,
        4,
        6,
        7,
        8,
        9,
        10,
        12,
        13,
        14,
        15,
        16,
        17,
        18,
        20,
        22,
        24,
        25,
        26,
        27,
        28,
    ),
)

_RAINBOW_DISCRETE_BAD = {
    '23': '#777777',
}

_RAINBOW_DISCRETE_DEFAULT_BAD = '#FFFFFF'

CMAP_NAMES = OFFICIAL_CMAP_NAMES + (
    'incandescent', 'incandescent_discrete',
    'banded_12', 'banded_16', 'banded_20',
)


def tol_cset(colorset=None):
    """
    Discrete colour sets for qualitative and categorical data.

    - When 'colorset' is None, returns 'OFFICIAL_CSET_NAMES'.
    - For schemes from tol_colors.py ('bright', 'high-contrast', 'vibrant',
      'muted', 'medium-contrast', 'light'), returns a namedtuple with the
      official colour names and hex values.
    - For site-only schemes ('dark', 'pale', 'groundcover'), returns a tuple
      of #RRGGBB hex strings (no colour names are invented).
    """
    if colorset is None:
        return OFFICIAL_CSET_NAMES
    if colorset in _NAMED_CSETS:
        entry = _NAMED_CSETS[colorset]
        cls_name = colorset.replace('-', '_').title().replace('_', '') + 'Cset'
        tuple_cls = namedtuple(cls_name, entry['fields'])
        return tuple_cls(*entry['hex'])
    if colorset in _UNNAMED_CSETS:
        return _UNNAMED_CSETS[colorset]
    raise ValueError(f"Unknown colorset {colorset!r}. Known sets: {CSET_NAMES}")


def tol_cmap_colors(colormap='rainbow_PuRd', lut=None):
    """
    Return (colors, bad_hex, mode) for an ordered colormap without requiring matplotlib.

    'mode' is either 'linear' or 'discrete'.
    For 'rainbow_discrete', 'lut' selects the number of discrete stops (1..23, default 22).
    """
    if colormap is None:
        return OFFICIAL_CMAP_NAMES
    if colormap == 'rainbow_discrete' or colormap == 'rainbow-discrete':
        if lut is None or not isinstance(lut, int) or lut < 1 or lut > len(_RAINBOW_DISCRETE_LUT):
            lut = 22
        idxs = _RAINBOW_DISCRETE_LUT[lut - 1]
        clrs = tuple(_RAINBOW_DISCRETE_COLORS[i] for i in idxs)
        bad = _RAINBOW_DISCRETE_BAD.get(str(lut), _RAINBOW_DISCRETE_DEFAULT_BAD)
        return clrs, bad, 'discrete'
    normalized = colormap.replace('-', '_') if colormap not in _CMAPS else colormap
    if normalized in _CMAPS:
        entry = _CMAPS[normalized]
        return entry['colors'], entry['bad'], entry['mode']
    raise ValueError(f"Unknown colormap {colormap!r}. Known colormaps: {CMAP_NAMES}")


def discretemap(colormap, hexclrs):
    """
    Produce a matplotlib colormap from a list of discrete colours without interpolation.
    Requires matplotlib and numpy.
    """
    import numpy as np
    from matplotlib.colors import LinearSegmentedColormap, to_rgba_array

    clrs = to_rgba_array(list(hexclrs))
    clrs = np.vstack([clrs[0], clrs, clrs[-1]])
    cdict = {}
    for ki, key in enumerate(('red', 'green', 'blue')):
        cdict[key] = [
            (i / (len(clrs) - 2.0), float(clrs[i, ki]), float(clrs[i + 1, ki]))
            for i in range(len(clrs) - 1)
        ]
    return LinearSegmentedColormap(colormap, cdict)


def tol_cmap(colormap=None, lut=None):
    """
    Return a matplotlib colormap for ordered data (continuous or discrete).
    When 'colormap' is None, returns 'OFFICIAL_CMAP_NAMES'.
    Requires matplotlib (imported lazily).
    """
    if colormap is None:
        return OFFICIAL_CMAP_NAMES
    from matplotlib.colors import LinearSegmentedColormap

    clrs, bad, mode = tol_cmap_colors(colormap, lut=lut)
    if mode == 'discrete':
        cmap = discretemap(colormap, clrs)
    else:
        cmap = LinearSegmentedColormap.from_list(colormap, list(clrs))
    cmap.set_bad(bad)
    return cmap
